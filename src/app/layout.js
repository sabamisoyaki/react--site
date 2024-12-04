import './globals.css';

export const metadata = {
  title: 'Next.js App',
  description: 'A simple Next.js application',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
