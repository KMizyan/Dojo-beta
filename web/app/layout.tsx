import './globals.css';
import { Manrope } from 'next/font/google';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});
import Link from 'next/link';
import AuthNav from '../components/AuthNav';

export const metadata = {
  title: 'DOJO',
  description: 'A-level Mathematics',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html className={manrope.variable}>
      <body>
        <div className="shell">
          <nav className="nav">
              <Link className="navStandaloneIcon" href="/" aria-label="DOJO home">
                <img
                  src="/icon.png"
                  alt=""
                  className="brandIcon"
                  aria-hidden="true"
                />
              </Link>
            <div className="brandLockup">
              <Link className="brand" href="/">
                <span className="brandProject">PROJECT</span>
                <span className="brandDojo">DOJO</span>
              </Link>
              <span className="brandSubject">A-LEVEL MATHEMATICS</span>
            </div>
            <Link href="/topics">Topics</Link>
            <Link href="/papers">Papers</Link>
            
            <AuthNav />
          </nav>

          {children}
        </div>
      <style>{`
          .navStandaloneIcon {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            line-height: 0;
            margin-right: 28px;
          }

          .brandIcon {
            width: 40px;
            height: 40px;
            object-fit: contain;
            border-radius: 4px;
            flex: 0 0 auto;
          }
        `}</style>
        </body>
    </html>
  );
}
