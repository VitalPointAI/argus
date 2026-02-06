const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getSources() {
  const res = await fetch(`${API_URL}/api/v1/sources`, { cache: 'no-store' });
  return res.json();
}

export default async function SourcesPage() {
  const sourcesData = await getSources();
  const sources = sourcesData.data || [];

  // Group by domain
  const byDomain = sources.reduce((acc: any, source: any) => {
    const domain = source.domain?.name || 'Unknown';
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(source);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sources</h1>
        <p className="text-slate-600 mt-2">
          {sources.length} active sources across {Object.keys(byDomain).length} domains
        </p>
      </div>

      {Object.entries(byDomain).map(([domain, domainSources]: [string, any]) => (
        <div key={domain} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            {domain}
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({domainSources.length} sources)
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {domainSources.map((source: any) => (
              <div key={source.id} className="bg-slate-50 p-4 rounded">
                <div className="font-medium">{source.name}</div>
                <div className="flex items-center gap-2 mt-2 text-sm">
                  <span className="bg-slate-200 px-2 py-0.5 rounded text-xs">{source.type}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    source.reliability >= 70 ? 'bg-green-100 text-green-800' :
                    source.reliability >= 40 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {source.reliability}% reliable
                  </span>
                  {source.isActive ? (
                    <span className="text-green-600 text-xs">● Active</span>
                  ) : (
                    <span className="text-red-600 text-xs">● Inactive</span>
                  )}
                </div>
                {source.lastFetchedAt && (
                  <div className="text-xs text-slate-400 mt-2">
                    Last fetched: {new Date(source.lastFetchedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
