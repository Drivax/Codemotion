import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CodeMotion · See how your code connects', description: 'A local Python object inspector and static data flow explorer.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
