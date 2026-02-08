/**
 * OPSEC Onboarding for HUMINT Sources
 * 
 * Guides non-technical sources through secure registration
 * to avoid mistakes that could dox them.
 * 
 * Threat Model:
 * - Adversary knows "someone got paid by Argus"
 * - Can access blockchain explorers
 * - May have chain analysis tools
 * - Could subpoena exchanges
 * - Might monitor network traffic
 */

// ============================================
// Risk Assessment
// ============================================

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskProfile {
  threatLevel: ThreatLevel;
  location: 'safe' | 'monitored' | 'hostile';
  consequences: 'embarrassment' | 'job_loss' | 'legal' | 'physical_danger';
  adversaryCapability: 'none' | 'basic' | 'sophisticated' | 'state_level';
}

export interface OnboardingChecklist {
  step: string;
  description: string;
  required: boolean;
  completed: boolean;
  warningIfSkipped?: string;
}

/**
 * Generate personalized OPSEC checklist based on risk profile
 */
export function generateChecklist(profile: RiskProfile): OnboardingChecklist[] {
  const checklist: OnboardingChecklist[] = [];
  
  // === ALWAYS REQUIRED ===
  checklist.push({
    step: 'fresh_wallet',
    description: 'Create a brand new wallet that has never been used before',
    required: true,
    completed: false,
    warningIfSkipped: 'Reusing a wallet can link your source identity to your real identity',
  });
  
  checklist.push({
    step: 'no_exchange_wallet',
    description: 'Do NOT use an exchange wallet address (Coinbase, Binance, etc.)',
    required: true,
    completed: false,
    warningIfSkipped: 'Exchanges have KYC data and will comply with subpoenas',
  });
  
  checklist.push({
    step: 'understand_risks',
    description: 'I understand that being identified as an Argus source could have consequences',
    required: true,
    completed: false,
  });
  
  // === MEDIUM+ THREAT LEVEL ===
  if (['medium', 'high', 'critical'].includes(profile.threatLevel)) {
    checklist.push({
      step: 'vpn_tor',
      description: 'Use Tor Browser or a trusted VPN when registering and submitting',
      required: true,
      completed: false,
      warningIfSkipped: 'Your IP address can be logged and traced to your location',
    });
    
    checklist.push({
      step: 'separate_device',
      description: 'Consider using a separate device not linked to your identity',
      required: false,
      completed: false,
    });
    
    checklist.push({
      step: 'privacy_payment',
      description: 'Use ZEC shielded or Monero for payments (NOT transparent chains)',
      required: true,
      completed: false,
      warningIfSkipped: 'Transparent blockchain payments can be traced with chain analysis',
    });
  }
  
  // === HIGH+ THREAT LEVEL ===
  if (['high', 'critical'].includes(profile.threatLevel)) {
    checklist.push({
      step: 'offline_wallet',
      description: 'Create your wallet offline or in Tails OS',
      required: true,
      completed: false,
      warningIfSkipped: 'Online wallet creation can leak your IP to wallet providers',
    });
    
    checklist.push({
      step: 'unique_codename',
      description: 'Never mention your codename outside of Argus',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'no_identifiable_info',
      description: 'Never include identifying details in your submissions',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'metadata_scrub',
      description: 'Remove metadata from any photos/documents before uploading',
      required: true,
      completed: false,
      warningIfSkipped: 'EXIF data in photos can reveal your exact location and device',
    });
  }
  
  // === CRITICAL THREAT LEVEL (State-level adversary) ===
  if (profile.threatLevel === 'critical') {
    checklist.push({
      step: 'air_gapped',
      description: 'Use an air-gapped device for sensitive operations',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'timing_variation',
      description: 'Vary your submission times to avoid pattern analysis',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'multiple_hops',
      description: 'Use multiple privacy layers (VPN → Tor → submission)',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'delayed_payout',
      description: 'Request delayed/batched payouts to break timing correlation',
      required: true,
      completed: false,
    });
    
    checklist.push({
      step: 'dead_drop_withdrawal',
      description: 'Consider "dead drop" withdrawal: donate to a cause instead of personal wallet',
      required: false,
      completed: false,
    });
  }
  
  return checklist;
}

// ============================================
// Guided OPSEC Content
// ============================================

export const OPSEC_GUIDES = {
  wallet_creation: {
    title: 'Creating a Private Wallet',
    steps: [
      {
        title: 'Use Tor Browser',
        content: 'Download and use Tor Browser (torproject.org) for all wallet-related activities.',
        why: 'Your regular browser leaks your IP address to every website you visit.',
      },
      {
        title: 'Choose a Privacy Wallet',
        content: `Recommended wallets by chain:
• ZEC Shielded: Zecwallet Lite, Ywallet, or Nighthawk
• XMR: Official Monero GUI, Cake Wallet, or Monerujo
• BTC (if you must): Wasabi Wallet with CoinJoin`,
        why: 'Standard wallets often phone home to central servers.',
      },
      {
        title: 'Create Offline if Possible',
        content: 'For maximum security, create your wallet on an air-gapped computer or in Tails OS.',
        why: 'Online wallet creation can be intercepted or logged.',
      },
      {
        title: 'Backup Securely',
        content: 'Write your seed phrase on paper. Never store it digitally. Hide it well.',
        why: 'Digital backups can be hacked. Your seed phrase IS your wallet.',
      },
    ],
  },
  
  payment_privacy: {
    title: 'Understanding Payment Privacy',
    levels: [
      {
        level: '🛡️ Maximum: ZEC Shielded',
        explanation: 'z-addresses (starting with "zs1") hide everything: sender, receiver, AND amount.',
        recommendation: 'STRONGLY RECOMMENDED for all HUMINT sources.',
      },
      {
        level: '🔒 Very High: Monero (XMR)',
        explanation: 'Privacy by default. All transactions are shielded.',
        caveat: 'Some exchanges are delisting XMR due to regulatory pressure.',
      },
      {
        level: '⚠️ Low: Bitcoin, Ethereum, etc.',
        explanation: 'Pseudonymous only. Chain analysis companies can trace transactions.',
        warning: 'NOT recommended if your safety depends on anonymity.',
      },
    ],
  },
  
  common_mistakes: {
    title: 'Mistakes That Can Dox You',
    mistakes: [
      {
        mistake: 'Using an exchange wallet',
        why: 'Exchanges have your ID/passport from KYC. They comply with subpoenas.',
        fix: 'Always use a self-custody wallet you created yourself.',
      },
      {
        mistake: 'Reusing addresses',
        why: 'Allows clustering analysis to link all your activity together.',
        fix: 'Use a fresh address for every payment. Most wallets support this.',
      },
      {
        mistake: 'Converting immediately to fiat',
        why: 'Creates a paper trail to your bank account.',
        fix: 'If you must convert, use P2P exchanges with cash pickup.',
      },
      {
        mistake: 'Posting about Argus on social media',
        why: 'Links your public identity to your source activity.',
        fix: 'Never discuss your role as a source publicly. Ever.',
      },
      {
        mistake: 'Using your regular browser/IP',
        why: 'Your IP can be logged and traced to your physical location.',
        fix: 'Always use Tor or a trusted VPN when interacting with Argus.',
      },
      {
        mistake: 'Uploading unprocessed photos',
        why: 'EXIF metadata includes GPS coordinates, device info, timestamps.',
        fix: 'Use a metadata removal tool before uploading any media.',
      },
    ],
  },
  
  hostile_environment: {
    title: 'Operating in Hostile Environments',
    guidance: `If you are in a country with:
• Authoritarian government
• Press freedom restrictions
• Active surveillance programs
• History of retaliation against sources

Take these additional precautions:
1. Use Tails OS (boots from USB, leaves no trace)
2. Access only via Tor (never regular internet)
3. Use public WiFi away from your home/work
4. Never access from your phone
5. Consider using a dedicated device that you can destroy
6. Vary your access times (avoid patterns)
7. Have a cover story for why you'd need privacy tools
8. Consider requesting "donation mode" - we donate your earnings to a cause instead of paying you directly`,
  },
};

// ============================================
// Privacy Recommendations
// ============================================

export function getPaymentRecommendation(profile: RiskProfile): {
  primary: string;
  secondary: string;
  avoid: string[];
  explanation: string;
} {
  if (profile.threatLevel === 'critical' || profile.consequences === 'physical_danger') {
    return {
      primary: 'zec-shielded',
      secondary: 'donation', // Donate to charity instead of personal payout
      avoid: ['btc', 'eth', 'sol', 'zec-transparent', 'any-exchange'],
      explanation: 'Your safety is paramount. Use only fully shielded payments or consider donating your earnings instead of receiving direct payment.',
    };
  }
  
  if (profile.threatLevel === 'high' || profile.consequences === 'legal') {
    return {
      primary: 'zec-shielded',
      secondary: 'xmr',
      avoid: ['btc', 'eth', 'sol', 'zec-transparent'],
      explanation: 'Legal exposure requires strong privacy. Transparent blockchains can be subpoenaed and analyzed.',
    };
  }
  
  if (profile.threatLevel === 'medium') {
    return {
      primary: 'zec-shielded',
      secondary: 'btc', // With caution
      avoid: ['eth', 'sol', 'exchange-wallets'],
      explanation: 'Shielded ZEC is recommended. If using Bitcoin, use Wasabi Wallet with CoinJoin.',
    };
  }
  
  // Low threat
  return {
    primary: 'any',
    secondary: 'any',
    avoid: ['exchange-wallets'],
    explanation: 'Standard precautions apply. Still avoid exchange wallets that have your KYC data.',
  };
}

// ============================================
// Onboarding State Machine
// ============================================

export type OnboardingStep = 
  | 'welcome'
  | 'risk_assessment'
  | 'checklist'
  | 'wallet_guide'
  | 'payment_setup'
  | 'verification'
  | 'complete';

export interface OnboardingState {
  currentStep: OnboardingStep;
  riskProfile?: RiskProfile;
  checklist: OnboardingChecklist[];
  paymentMethod?: string;
  paymentAddress?: string;
  allRequiredComplete: boolean;
}

export function initOnboarding(): OnboardingState {
  return {
    currentStep: 'welcome',
    checklist: [],
    allRequiredComplete: false,
  };
}

export function advanceOnboarding(state: OnboardingState, data: any): OnboardingState {
  switch (state.currentStep) {
    case 'welcome':
      return { ...state, currentStep: 'risk_assessment' };
      
    case 'risk_assessment':
      const profile = data as RiskProfile;
      const checklist = generateChecklist(profile);
      return { 
        ...state, 
        currentStep: 'checklist',
        riskProfile: profile,
        checklist,
      };
      
    case 'checklist':
      const requiredItems = state.checklist.filter(c => c.required);
      const allComplete = requiredItems.every(c => c.completed);
      if (allComplete) {
        return { 
          ...state, 
          currentStep: 'wallet_guide',
          allRequiredComplete: true,
        };
      }
      return state; // Stay on checklist until complete
      
    case 'wallet_guide':
      return { ...state, currentStep: 'payment_setup' };
      
    case 'payment_setup':
      return { 
        ...state, 
        currentStep: 'verification',
        paymentMethod: data.method,
        paymentAddress: data.address,
      };
      
    case 'verification':
      return { ...state, currentStep: 'complete' };
      
    default:
      return state;
  }
}
