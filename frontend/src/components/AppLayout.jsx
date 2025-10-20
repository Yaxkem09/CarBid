import React from 'react';
import Header from './Header.jsx';

export default function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-content">{children}</main>
    </div>
  );
}
