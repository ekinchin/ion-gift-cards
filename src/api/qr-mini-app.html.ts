export const qrMiniAppHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Сканирование QR</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--tg-theme-bg-color, #ffffff);
      color: var(--tg-theme-text-color, #111111);
      display: grid;
      place-items: center;
    }

    main {
      width: min(100% - 32px, 420px);
    }

    h1 {
      font-size: 24px;
      margin: 0 0 12px;
    }

    p {
      color: var(--tg-theme-hint-color, #667085);
      line-height: 1.45;
      margin: 0 0 20px;
    }

    button {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 8px;
      background: var(--tg-theme-button-color, #2481cc);
      color: var(--tg-theme-button-text-color, #ffffff);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .result {
      margin-top: 18px;
      padding: 14px;
      border: 1px solid var(--tg-theme-section_separator_color, #d0d5dd);
      border-radius: 8px;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main>
    <h1>Сканирование QR</h1>
    <p>Наведите камеру на QR-код сертификата. После распознавания код будет отправлен в систему проверки баланса.</p>
    <button id="scan-button" type="button">Сканировать QR</button>
    <div id="result" class="result" hidden></div>
  </main>

  <script>
    const tg = window.Telegram?.WebApp;
    const button = document.getElementById('scan-button');
    const result = document.getElementById('result');

    function show(message) {
      result.hidden = false;
      result.textContent = message;
    }

    async function loadBalance(code) {
      show('Проверяем баланс...');
      const response = await fetch('/api/cards/' + encodeURIComponent(code) + '/balance');
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        show(body.error || 'Не удалось проверить баланс');
        return;
      }

      show('Карта: ' + body.code + '\\nБаланс: ' + body.balance + ' ₽');
    }

    function scan() {
      if (!window.Telegram?.WebApp?.showScanQrPopup) {
        show('QR-сканер доступен только внутри Telegram.');
        return;
      }

      window.Telegram.WebApp.showScanQrPopup({ text: 'Наведите камеру на QR-код сертификата' }, (code) => {
        window.Telegram.WebApp.closeScanQrPopup();
        loadBalance(code);
        return true;
      });
    }

    tg?.ready();
    tg?.expand();
    button.addEventListener('click', scan);
  </script>
</body>
</html>`;
