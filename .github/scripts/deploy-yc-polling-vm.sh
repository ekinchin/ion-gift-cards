#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  YC_BOT_VM_NAME
  YC_SUBNET_ID
  YC_RUNTIME_SA_ID
  YC_FOLDER_ID
  YC_LOCKBOX_SECRET_ID
  BOT_POLLING_IMAGE
)

missing_vars=()
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing_vars+=("$var_name")
  fi
done

if (( ${#missing_vars[@]} > 0 )); then
  printf 'Missing required environment variables:\n' >&2
  printf ' - %s\n' "${missing_vars[@]}" >&2
  exit 1
fi

vm_cores="${YC_BOT_VM_CORES:-2}"
vm_memory="${YC_BOT_VM_MEMORY:-2}"
vm_core_fraction="${YC_BOT_VM_CORE_FRACTION:-20}"
vm_disk_size="${YC_BOT_VM_DISK_SIZE:-16}"
vm_disk_type="${YC_BOT_VM_DISK_TYPE:-network-hdd}"
vm_platform="${YC_BOT_VM_PLATFORM:-standard-v3}"
db_ssl="${DB_SSL:-true}"
db_pool_min="${DB_POOL_MIN:-0}"
db_pool_max="${DB_POOL_MAX:-2}"

if [[ -z "${YC_ZONE:-}" ]]; then
  echo "YC_ZONE is not set; deriving it from subnet ${YC_SUBNET_ID}"

  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to derive YC_ZONE from YC_SUBNET_ID" >&2
    exit 1
  fi

  YC_ZONE="$(yc vpc subnet get "$YC_SUBNET_ID" --format json | jq -r '.zone_id // empty')"

  if [[ -z "$YC_ZONE" ]]; then
    echo "Could not derive YC_ZONE from subnet ${YC_SUBNET_ID}" >&2
    exit 1
  fi
fi

cloud_config_file="$(mktemp)"
trap 'rm -f "$cloud_config_file"' EXIT
chmod 600 "$cloud_config_file"

cat > "$cloud_config_file" <<EOF
#cloud-config
write_files:
  - path: /opt/ion-gift-card/run-bot.sh
    owner: root:root
    permissions: '0700'
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      exec > >(tee -a /var/log/ion-gift-card-bot-startup.log /dev/console) 2>&1
      export HOME=/root

      image="${BOT_POLLING_IMAGE}"
      folder_id="${YC_FOLDER_ID}"
      lockbox_secret_id="${YC_LOCKBOX_SECRET_ID}"
      yc_bin="/root/yandex-cloud/bin/yc"
      env_file="/etc/ion-gift-card-bot.env"

      if [[ ! -x "\$yc_bin" ]]; then
        curl --fail --silent --show-error --location https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash -s -- -a
      fi

      metadata_token_response="\$(curl --fail --silent --show-error \
        --header 'Metadata-Flavor: Google' \
        http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token)"

      iam_token="\$(printf '%s' "\$metadata_token_response" \
        | sed -n 's/.*"\(access_token\|accessToken\|iamToken\|token\)"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\2/p' \
        | head -n 1)"

      if [[ -z "\$iam_token" && -n "\$metadata_token_response" ]]; then
        iam_token="\$(printf '%s' "\$metadata_token_response" | tr -d '[:space:]')"
      fi

      if [[ -z "\$iam_token" ]]; then
        echo "Could not read IAM token from VM metadata service" >&2
        printf 'Metadata token response bytes: %s\n' "\${#metadata_token_response}" >&2
        printf 'Metadata token response keys: ' >&2
        printf '%s' "\$metadata_token_response" \
          | grep -o '"[^"]*"[[:space:]]*:' \
          | sed 's/[":[:space:]]//g' \
          | tr '\n' ' ' >&2 || true
        echo >&2
        exit 1
      fi

      "\$yc_bin" config profile create vm-runtime >/dev/null 2>&1 || true
      "\$yc_bin" config set folder-id "\$folder_id"

      read_secret() {
        local key="\$1"
        YC_IAM_TOKEN="\$iam_token" "\$yc_bin" lockbox payload get --id "\$lockbox_secret_id" --key "\$key"
      }

      until docker info >/dev/null 2>&1; do
        echo "Waiting for Docker daemon"
        sleep 2
      done

      umask 077
      {
        echo "TELEGRAM_MODE=polling"
        echo "DB_HOST=\$(read_secret DB_HOST)"
        echo "DB_PORT=\$(read_secret DB_PORT)"
        echo "DB_NAME=\$(read_secret DB_NAME)"
        echo "DB_USER=\$(read_secret DB_USER)"
        echo "DB_PASSWORD=\$(read_secret DB_PASSWORD)"
        echo "DB_SSL=${db_ssl}"
        echo "DB_POOL_MIN=${db_pool_min}"
        echo "DB_POOL_MAX=${db_pool_max}"
        echo "TELEGRAM_BOT_TOKEN=\$(read_secret TELEGRAM_BOT_TOKEN)"
        echo "WEB_APP_URL=\$(read_secret WEB_APP_URL)"
      } > "\$env_file"

      echo "\$iam_token" | docker login --username iam --password-stdin cr.yandex
      docker pull "\$image"
      docker rm -f ion-gift-card-bot >/dev/null 2>&1 || true
      docker run --detach \
        --name ion-gift-card-bot \
        --restart always \
        --env-file "\$env_file" \
        "\$image"

  - path: /etc/systemd/system/ion-gift-card-bot.service
    owner: root:root
    permissions: '0644'
    content: |
      [Unit]
      Description=Ion Gift Card Telegram polling bot
      Wants=network-online.target docker.service
      After=network-online.target docker.service

      [Service]
      Type=oneshot
      RemainAfterExit=yes
      StandardOutput=journal+console
      StandardError=journal+console
      ExecStart=/opt/ion-gift-card/run-bot.sh
      ExecStop=-/usr/bin/docker stop ion-gift-card-bot
      ExecStopPost=-/usr/bin/docker rm ion-gift-card-bot

      [Install]
      WantedBy=multi-user.target

runcmd:
  - systemctl daemon-reload
  - systemctl enable --now ion-gift-card-bot.service
EOF

if yc compute instance get "$YC_BOT_VM_NAME" >/dev/null 2>&1; then
  echo "Deleting existing polling bot VM before recreating it: ${YC_BOT_VM_NAME}"
  yc compute instance delete "$YC_BOT_VM_NAME"
fi

echo "Creating polling bot VM: ${YC_BOT_VM_NAME}"
yc compute instance create "$YC_BOT_VM_NAME" \
  --zone "$YC_ZONE" \
  --platform "$vm_platform" \
  --cores "$vm_cores" \
  --memory "$vm_memory" \
  --core-fraction "$vm_core_fraction" \
  --service-account-id "$YC_RUNTIME_SA_ID" \
  --create-boot-disk "image-family=container-optimized-image,image-folder-id=standard-images,type=${vm_disk_type},size=${vm_disk_size},auto-delete=true" \
  --network-interface "subnet-id=${YC_SUBNET_ID},nat-ip-version=ipv4" \
  --metadata-from-file "user-data=${cloud_config_file}"
