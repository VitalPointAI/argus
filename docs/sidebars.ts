import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      items: ['getting-started/installation', 'getting-started/configuration', 'getting-started/first-briefing'],
    },
    {
      type: 'category',
      label: 'Features',
      items: [
        'features/sources', 
        'features/briefings', 
        'features/verification', 
        'features/source-lists',
        'features/source-marketplace',
        'features/access-passes',
        'features/analytics',
        'features/humint',
        'features/intel-bounties',
        'features/zk-proofs',
        'features/near-verification',
        'features/shade-agent',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api/overview', 'api/sources', 'api/articles', 'api/briefings', 'api/search', 'api/verification'],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: ['integrations/telegram', 'integrations/bastion', 'integrations/zcash-escrow'],
    },
    {
      type: 'category',
      label: 'Self-Hosting',
      items: ['self-hosting/deployment', 'self-hosting/database', 'self-hosting/environment'],
    },
  ],
};

export default sidebars;
