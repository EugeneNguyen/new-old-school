import React from 'react';

export default function Dashboard() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/system')
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🚀 nos Internal Tools</h1>
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #ccc',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9'
      }}>
        <h2>System Status</h2>
        {data ? (
          <pre>{JSON.stringify(data, null, 2)}</pre>
        ) : (
          <p>Loading system status...</p>
        )}
      </div>
    </div>
  );
}
