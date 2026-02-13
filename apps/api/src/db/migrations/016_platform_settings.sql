-- Platform-wide settings (admin configurable)
CREATE TABLE platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default platform fee
INSERT INTO platform_settings (key, value, description) VALUES
    ('marketplace_fee_percent', '5', 'Platform fee percentage for marketplace transactions (0-100)'),
    ('min_withdrawal_usdc', '10', 'Minimum withdrawal amount in USDC'),
    ('platform_wallet', '"argus-intel.near"', 'NEAR wallet for receiving platform fees'),
    ('marketplace_enabled', 'true', 'Whether the marketplace is open for transactions');
