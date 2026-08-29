import React, { useState } from 'react';
import AdminLogin from './components/AdminLogin';
import DashboardView from './components/DashboardView';

export default function App() {
  const [authenticatedAddress, setAuthenticatedAddress] = useState(null);

  return (
    <div>
      {authenticatedAddress ? (
        <DashboardView
          adminAddress={authenticatedAddress}
          onLogout={() => setAuthenticatedAddress(null)}
        />
      ) : (
        <AdminLogin onLoginSuccess={(address) => setAuthenticatedAddress(address)} />
      )}
    </div>
  );
}