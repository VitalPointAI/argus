const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getLatestBriefing() {
  try {
    const res = await fetch(`${API_URL}/api/v1/briefings/latest`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function previewBriefing() {
  try {
    const res = await fetch(`${API_URL}/api/briefings/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'morning', hoursBack: 24 }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function BriefingsPage() {
  const [latestData, previewData] = await Promise.all([
    getLatestBriefing(),
    previewBriefing(),
  ]);

  const latest = latestData?.data;
  const preview = previewData?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Briefings</h1>
        <p className="text-slate-600 mt-2">
          Strategic intelligence summaries with forecasts
        </p>
      </div>

      {/* Preview Briefing */}
      {preview && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">📊 Current Briefing Preview</h2>
            <span className="text-sm text-slate-500">Last 24 hours</span>
          </div>
          
          {/* Summary */}
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap bg-slate-50 p-4 rounded text-sm">
              {preview.summary}
            </pre>
          </div>

          {/* Changes */}
          {preview.changes && preview.changes.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">🔄 Significant Changes</h3>
              <div className="space-y-2">
                {preview.changes.map((change: any, i: number) => (
                  <div key={i} className={`p-3 rounded ${
                    change.significance === 'high' ? 'bg-red-50 border-l-4 border-red-500' :
                    change.significance === 'medium' ? 'bg-yellow-50 border-l-4 border-yellow-500' :
                    'bg-green-50 border-l-4 border-green-500'
                  }`}>
                    <div className="font-medium text-sm">{change.description}</div>
                    <div className="text-xs text-slate-500 mt-1">{change.domain}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forecasts */}
          {preview.forecasts && preview.forecasts.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">🔮 Forecasts</h3>
              <div className="space-y-2">
                {preview.forecasts.map((forecast: any, i: number) => (
                  <div key={i} className="bg-slate-50 p-3 rounded">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{forecast.event}</span>
                      <span className="text-sm font-bold text-argus-600">{forecast.probability}%</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Timeframe: {forecast.timeframe} • Confidence: {forecast.confidence}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="text-sm text-slate-500">
              Based on {preview.contentIds?.length || 0} articles
            </div>
          </div>
        </div>
      )}

      {/* Latest Saved Briefing */}
      {latest && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Latest Saved Briefing
            <span className="ml-2 text-sm font-normal text-slate-500">
              {new Date(latest.generatedAt).toLocaleString()}
            </span>
          </h2>
          <pre className="whitespace-pre-wrap bg-slate-50 p-4 rounded text-sm">
            {latest.summary}
          </pre>
        </div>
      )}

      {!preview && !latest && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-slate-500">
          No briefings available yet. Content is being analyzed.
        </div>
      )}
    </div>
  );
}
