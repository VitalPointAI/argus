const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getDomains() {
  const res = await fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' });
  return res.json();
}

export default async function DomainsPage() {
  const domainsData = await getDomains();
  const domains = domainsData.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Domains</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Strategic domains being monitored by Argus
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {domains.map((domain: any) => (
          <a
            key={domain.id}
            href={`/domains/${domain.slug}`}
            className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{domain.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{domain.description}</p>
            <div className="mt-4 flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs ${
                domain.isBuiltIn 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {domain.isBuiltIn ? 'Built-in' : 'Custom'}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{domain.slug}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
