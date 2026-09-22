import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Matchsticked: pick a movie together';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const [icon, playfair] = await Promise.all([
    readFile(join(process.cwd(), 'public/icon-512.png')),
    // Vendored (OFL, see _fonts/OFL.txt) so the build never depends on a font CDN.
    readFile(join(process.cwd(), 'src/app/_fonts/PlayfairDisplay-ExtraBold.ttf')),
  ]);
  const iconSrc = `data:image/png;base64,${icon.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 96px',
          gap: 56,
          background: 'radial-gradient(circle at 22% 40%, #3a1709 0%, #0D0D0D 60%)',
          color: '#F0E6D3',
        }}
      >
        <img src={iconSrc} alt="" width={300} height={300} style={{ borderRadius: 48 }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontFamily: 'Playfair Display', fontSize: 104, fontWeight: 800, letterSpacing: -1 }}>
            Match<span style={{ color: '#E25A2E' }}>sticked</span>
          </div>
          <div style={{ fontSize: 40, color: '#B8AFA3', marginTop: 16 }}>
            Pick a movie together.
          </div>
          <div style={{ fontSize: 40, color: '#B8AFA3' }}>
            No more scrolling debates.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Playfair Display', data: playfair, weight: 800, style: 'normal' }],
    },
  );
}
