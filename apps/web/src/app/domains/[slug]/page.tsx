const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getDomain(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/domains/${slug}`, { cache: 'no-store' });
  return res.json();
}

async function getDomainContent(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/intelligence?domain=${slug}&limit=20`, { cache: 'no-store' });
  return res.json();
}

async function getDomainSources(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/sources?domain=${slug}`, { cache: 'no-store' });
  return res.json();
}

export default async function DomainPage({ params }: { params: { slug: string } }) {
  const [domainData, contentData, sourcesData] = await Promise.all([
    getDomain(params.slug),
    getDomainContent(params.slug),
    getDomainSources(params.slug),
  ]);

  const domain = domainData.data;
  const content = contentData.data || [];
  const sources = sourcesData.data || [];

  if (!domain) {
    return <div>Domain not found</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <a href="/domains" className="text-sm text-argus-600 hover:underline">← All Domains</a>
        <h1 className="text-3xl font-bold mt-2">{domain.name}</h1>
        <p className="text-slate-600 mt-2">{domain.description}</p>
        {domain.stats && (
          <div className="flex gap-4 mt-4">
            <div className="bg-slate-100 px-3 py-1 rounded">
              <span className="font-semibold">{domain.stats.contentCount}</span> articles
            </div>
            <div className="bg-slate-100 px-3 py-1 rounded">
              <span className="font-semibold">{domain.stats.sourceCount}</span> sources
            </div>
          </div>
        )}
      </div>

      {/* Sources */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Sources ({sources.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sources.map((source: any) => (
            <div key={source.id} className="bg-slate-50 p-3 rounded">
              <div className="font-medium text-sm">{source.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-slate-200 px-2 py-0.5 rounded">{source.type}</span>
                <span className="text-xs text-slate-500">
                  {source.reliability}% reliability
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Content */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Intelligence</h2>
        <div className="space-y-4">
          {content.map((item: any) => (
            <article key={item.id} className="border-b border-slate-100 pb-4 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-argus-600">
                    {item.title}
                  </a>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                    <span>{item.source?.name}</span>
                    <span>•</span>
                    <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-sm font-medium ${
                  item.confidenceScore >= 70 ? 'bg-green-100 text-green-800' :
                  item.confidenceScore >= 40 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {item.confidenceScore}%
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
