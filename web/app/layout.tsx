import './globals.css'; import Link from 'next/link';
export const metadata={title:'DOJO',description:'A-level Mathematics'};
export default function Layout({children}:{children:React.ReactNode}){return <html><body><div className="shell"><nav className="nav"><Link className="brand" href="/">DOJO</Link><Link href="/topics">Topics</Link><Link href="/papers">Papers</Link><Link href="/my-work">My Work</Link></nav>{children}</div></body></html>}
