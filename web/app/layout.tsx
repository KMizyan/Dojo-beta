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
      </body>
    </html>
  );
}
