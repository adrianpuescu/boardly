import { ImageResponse } from "next/og";

export const runtime = "edge";

/** Matches Navbar: Nunito black + text-gray-900 + letter-spacing from header. */
const BOARDLY_STYLE = {
  fontFamily: "Nunito",
  fontSize: 88,
  fontWeight: 900,
  color: "#111827",
  letterSpacing: -0.5,
  lineHeight: 1,
} as const;

/** Wiki-style knight from `public/pieces/` — loaded as a real asset (Satori breaks complex inline SVG paths). */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const knightUrl = `${origin}/pieces/cburnett/wN.svg`;

  const [nunito500, nunito600, nunito900] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhRTM.ttf"
    ).then((res) => res.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDGUmRTM.ttf"
    ).then((res) => res.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDBImRTM.ttf"
    ).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FAF7F2",
          position: "relative",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 22,
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#F97316",
                borderRadius: 22,
              }}
            >
              {/* next/image is not applicable inside @vercel/og ImageResponse; remote URL is required */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={knightUrl}
                alt=""
                width={76}
                height={76}
                style={{
                  display: "flex",
                }}
              />
            </div>
            <span style={BOARDLY_STYLE}>Boardly</span>
          </div>
          <div
            style={{
              marginTop: 28,
              fontFamily: "Nunito",
              fontSize: 38,
              fontWeight: 600,
              color: "#6B7280",
              lineHeight: 1.3,
              textAlign: "center",
              maxWidth: 920,
            }}
          >
            Play board games with friends, your way.
          </div>
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 80,
            paddingRight: 80,
            paddingBottom: 48,
          }}
        >
          <span
            style={{
              fontFamily: "Nunito",
              fontSize: 22,
              fontWeight: 500,
              color: "#9CA3AF",
              letterSpacing: 0.5,
            }}
          >
            boardly.webz.ro
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Nunito", data: nunito500, style: "normal", weight: 500 },
        { name: "Nunito", data: nunito600, style: "normal", weight: 600 },
        { name: "Nunito", data: nunito900, style: "normal", weight: 900 },
      ],
    }
  );
}
