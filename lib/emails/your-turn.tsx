interface YourTurnEmailProps {
  opponentName: string;
  gameUrl: string;
}

export function yourTurnEmail({ opponentName, gameUrl }: YourTurnEmailProps): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>It's your turn in Boardly!</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a2f 0%,#0f2318 100%);padding:32px 40px;text-align:center;">
              <span style="font-size:40px;">♟️</span>
              <h1 style="margin:12px 0 4px;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Boardly</h1>
              <p style="margin:0;color:#6b7280;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Chess Reimagined</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:22px;font-weight:600;">It's your turn! ♟️</h2>
              <p style="margin:0 0 24px;color:#9ca3af;font-size:15px;line-height:1.6;">
                <strong style="color:#d1d5db;">${opponentName}</strong> has made their move.
                Head back to the board and show them what you've got.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#16a34a;border-radius:8px;">
                    <a href="${gameUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.2px;">
                      Make your move →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
                Or copy this link into your browser:<br/>
                <a href="${gameUrl}" style="color:#4ade80;word-break:break-all;">${gameUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #2a2a2a;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:12px;">
                You're receiving this because you have an active game on Boardly.<br/>
                Good luck out there! 🎯
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface GameOverEmailProps {
  opponentName: string;
  result: "checkmate" | "stalemate" | "draw";
  didWin: boolean;
  gameUrl: string;
}

export function gameOverEmail({ opponentName, result, didWin, gameUrl }: GameOverEmailProps): string {
  const headline = didWin
    ? "You won! 🏆"
    : result === "checkmate"
    ? "You lost this one. 🤝"
    : result === "stalemate"
    ? "It's a stalemate! 🤝"
    : "It's a draw! 🤝";

  const subtext = didWin
    ? `Nicely played — you checkmated <strong style="color:#d1d5db;">${opponentName}</strong>.`
    : result === "checkmate"
    ? `<strong style="color:#d1d5db;">${opponentName}</strong> delivered checkmate. Better luck next time!`
    : `The game against <strong style="color:#d1d5db;">${opponentName}</strong> ended in a ${result}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Game over — Boardly</title>
</head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a2f 0%,#0f2318 100%);padding:32px 40px;text-align:center;">
              <span style="font-size:40px;">♟️</span>
              <h1 style="margin:12px 0 4px;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Boardly</h1>
              <p style="margin:0;color:#6b7280;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Chess Reimagined</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#ffffff;font-size:22px;font-weight:600;">${headline}</h2>
              <p style="margin:0 0 24px;color:#9ca3af;font-size:15px;line-height:1.6;">${subtext}</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#16a34a;border-radius:8px;">
                    <a href="${gameUrl}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      View game →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #2a2a2a;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:12px;">You're receiving this because you have an active game on Boardly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
