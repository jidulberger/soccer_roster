export const metadata = {
  title: 'Deathwalkers Roster',
  description: 'Soccer tournament roster rotation manager',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  )
}
