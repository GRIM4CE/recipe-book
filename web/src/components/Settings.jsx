export default function Settings({ user, onSignOut }) {
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <div className="settings-section">
        <p className="settings-label">Signed in as</p>
        <p className="settings-user">{user}</p>
      </div>
      <button className="btn danger" type="button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
