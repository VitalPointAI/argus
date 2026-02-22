import 'leaflet/dist/leaflet.css';

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col">
      {children}
    </div>
  );
}
