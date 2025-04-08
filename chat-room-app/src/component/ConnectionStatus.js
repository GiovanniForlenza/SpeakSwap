import React from 'react';
import { useSignalRConnection } from './SignalRConnectionProvider';

const ConnectionStatus = () => {
  const { connectionStatus } = useSignalRConnection();
  
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'Connected':
        return 'green';
      case 'Reconnecting':
        return 'orange';
      default:
        return 'red';
    }
  };

  return (
    <div style={{ color: getStatusColor(), marginBottom: '10px' }}>
      Stato: {connectionStatus}
    </div>
  );
};

export default ConnectionStatus;