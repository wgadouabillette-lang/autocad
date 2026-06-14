export default function SettingsComingSoon({ detail }: { detail?: string }) {
  return (
    <section className="settings-section">
      <p className="settings-coming-soon">Bientôt disponible.</p>
      {detail && <p className="settings-section__hint">{detail}</p>}
    </section>
  );
}
