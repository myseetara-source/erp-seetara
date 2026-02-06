import React from 'react'

const Layout = async ({ children }: { children: React.ReactNode }) => {
  return <div className="h-[calc(100vh-28px)] bg-gray-100 overflow-hidden">{children}</div>;
};

export default Layout;