import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const API_BASE_URL = 'https://bigbull-api.bigbullnow-dev.workers.dev/api/v1';

const App = () => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [balance, setBalance] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('wallet');
  const [showMenu, setShowMenu] = useState(false);
  const [authToken, setAuthToken] = useState(null);

  // Server auth flow states
  const [authStep, setAuthStep] = useState('idle'); // idle | fetching_nonce | signing | verifying | authenticated | error
  const [authError, setAuthError] = useState(null);
  const [nonceData, setNonceData] = useState(null); // { message, nonce, expires_at }
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [signatureDisplay, setSignatureDisplay] = useState(null);

  // Sign message (free-form) states
  const [messageToSign, setMessageToSign] = useState('');
  const [signedMessage, setSignedMessage] = useState(null);
  const [isSigning, setIsSigning] = useState(false);

  // Verify signature states
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifySignatureInput, setVerifySignatureInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null); // null | 'valid' | 'invalid'
  const [isVerifying, setIsVerifying] = useState(false);

  // Inner tab for sign card
  const [signTab, setSignTab] = useState('auth'); // 'auth' | 'sign' | 'verify'

  const connection = useMemo(() => new Connection(clusterApiUrl('devnet'), 'confirmed'), []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      await transact(async (wallet) => {
        const authResult = await wallet.authorize({
          cluster: 'devnet',
          identity: {
            name: 'SolMobile Wallet',
            uri: window.location.origin,
            icon: 'favicon.ico',
          },
        });
        
        setAuthToken(authResult.auth_token);
        
        if (authResult.accounts && authResult.accounts.length > 0) {
          const addressBytes = new Uint8Array(
            atob(authResult.accounts[0].address)
              .split('')
              .map((c) => c.charCodeAt(0))
          );
          const publicKey = new PublicKey(addressBytes);
          setWalletAddress(publicKey.toBase58());
        }
      });
    } catch (error) {
      console.error('Connection failed:', error);
      if (error.message && error.message.includes('User declined')) {
        alert('Connection rejected. Please approve the connection in your wallet.');
      } else if (error.message && error.message.includes('secure context')) {
        alert('This app must be served over HTTPS for the mobile wallet adapter to work.');
      } else {
        alert(`Failed to connect wallet: ${error.message || 'Unknown error'}. Make sure you have a Solana mobile wallet installed.`);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      if (authToken) {
        await transact(async (wallet) => {
          await wallet.deauthorize({ auth_token: authToken });
        });
      }
      setWalletAddress(null);
      setBalance(0);
      setRecentTransactions([]);
      setAuthToken(null);
      setShowMenu(false);
    } catch (error) {
      console.error('Disconnect failed:', error);
      setWalletAddress(null);
      setBalance(0);
      setRecentTransactions([]);
      setAuthToken(null);
      setShowMenu(false);
    }
  }, [authToken]);

  // Step 1: Request nonce from server
  const fetchNonce = useCallback(async () => {
    setAuthStep('fetching_nonce');
    setAuthError(null);
    setAccessToken(null);
    setRefreshToken(null);
    setApiKey(null);
    setUserInfo(null);
    setSignatureDisplay(null);
    setNonceData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(`Nonce request failed: ${response.status}`);
      }

      const { data } = await response.json();
      setNonceData(data);
      return data;
    } catch (error) {
      console.error('Nonce fetch failed:', error);
      setAuthStep('error');
      setAuthError(`Failed to get nonce: ${error.message}`);
      return null;
    }
  }, [walletAddress]);

  // Step 2: Sign the server message with wallet
  const signServerMessage = useCallback(async (message) => {
    setAuthStep('signing');
    try {
      let signatureBase58 = null;
      await transact(async (wallet) => {
        await wallet.reauthorize({ auth_token: authToken });
        const messageBytes = new TextEncoder().encode(message);
        const result = await wallet.signMessages({
          addresses: [
            new Uint8Array(
              atob(
                btoa(String.fromCharCode(...new PublicKey(walletAddress).toBytes()))
              ).split('').map(c => c.charCodeAt(0))
            )
          ],
          payloads: [messageBytes],
        });
        if (result && result.length > 0) {
          const signatureBytes = new Uint8Array(result[0]);
          signatureBase58 = bs58.encode(signatureBytes);
          setSignatureDisplay(signatureBase58);
        }
      });
      return signatureBase58;
    } catch (error) {
      console.error('Sign message failed:', error);
      if (error.message && error.message.includes('User declined')) {
        setAuthError('Signing rejected by wallet.');
      } else {
        setAuthError(`Failed to sign message: ${error.message || 'Unknown error'}`);
      }
      setAuthStep('error');
      return null;
    }
  }, [authToken, walletAddress]);

  // Step 3: Verify signature and get tokens
  const verifySignature = useCallback(async (signature, nonce) => {
    setAuthStep('verifying');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: walletAddress,
          signature: signature,
          nonce: nonce,
        }),
      });

      if (!response.ok) {
        throw new Error(`Verify request failed: ${response.status}`);
      }

      const { data } = await response.json();
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      setApiKey(data.apiKey || null);
      setUserInfo(data.user || null);
      setAuthStep('authenticated');
      return data;
    } catch (error) {
      console.error('Verification failed:', error);
      setAuthStep('error');
      setAuthError(`Verification failed: ${error.message}`);
      return null;
    }
  }, [walletAddress]);

  // Full 3-step authentication flow
  const authenticateWithServer = useCallback(async () => {
    if (!walletAddress || !authToken) return;

    // Step 1: Get nonce
    const nonce = await fetchNonce();
    if (!nonce) return;

    // Step 2: Sign the message
    const signature = await signServerMessage(nonce.message);
    if (!signature) return;

    // Step 3: Verify and get tokens
    await verifySignature(signature, nonce.nonce);
  }, [walletAddress, authToken, fetchNonce, signServerMessage, verifySignature]);

  // Free-form sign message
  const signMessage = useCallback(async () => {
    if (!messageToSign.trim() || !authToken) return;
    setIsSigning(true);
    setSignedMessage(null);
    try {
      await transact(async (wallet) => {
        await wallet.reauthorize({ auth_token: authToken });
        const messageBytes = new TextEncoder().encode(messageToSign);
        const result = await wallet.signMessages({
          addresses: [
            new Uint8Array(
              atob(
                btoa(String.fromCharCode(...new PublicKey(walletAddress).toBytes()))
              ).split('').map(c => c.charCodeAt(0))
            )
          ],
          payloads: [messageBytes],
        });
        if (result && result.length > 0) {
          const signatureBytes = new Uint8Array(result[0]);
          const signatureBase58 = bs58.encode(signatureBytes);
          setSignedMessage(signatureBase58);
        }
      });
    } catch (error) {
      console.error('Sign message failed:', error);
      if (error.message && error.message.includes('User declined')) {
        alert('Signing rejected by wallet.');
      } else {
        alert(`Failed to sign message: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsSigning(false);
    }
  }, [messageToSign, authToken, walletAddress]);

  // Verify a signature against the connected wallet
  const verifyMessageSignature = useCallback(async () => {
    if (!verifyMessage.trim() || !verifySignatureInput.trim() || !walletAddress) return;
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const messageBytes = new TextEncoder().encode(verifyMessage);
      const signatureBytes = bs58.decode(verifySignatureInput.trim());
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();
      const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      setVerifyResult(isValid ? 'valid' : 'invalid');
    } catch (error) {
      console.error('Verification failed:', error);
      setVerifyResult('invalid');
    } finally {
      setIsVerifying(false);
    }
  }, [verifyMessage, verifySignatureInput, walletAddress]);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const publicKey = new PublicKey(walletAddress);
      const balanceLamports = await connection.getBalance(publicKey);
      setBalance(balanceLamports / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }, [walletAddress, connection]);

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 10 });
      const txs = await Promise.all(
        signatures.map(async (sig) => {
          return {
            signature: sig.signature,
            timestamp: sig.blockTime,
            slot: sig.slot,
            err: sig.err,
          };
        })
      );
      setRecentTransactions(txs);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  }, [walletAddress, connection]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
      fetchTransactions();
      const interval = setInterval(() => {
        fetchBalance();
        fetchTransactions();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress, fetchBalance, fetchTransactions]);

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">◈</div>
            <span className="logo-text">SolMobile</span>
          </div>
          {walletAddress && (
            <button className="menu-btn" onClick={() => setShowMenu(!showMenu)}>
              <div className="menu-icon"></div>
            </button>
          )}
        </div>
        {showMenu && walletAddress && (
          <div className="dropdown-menu">
            <button onClick={disconnectWallet} className="menu-item disconnect">
              Disconnect Wallet
            </button>
          </div>
        )}
      </header>

      <main className="main-content">
        {!walletAddress ? (
          <div className="connect-screen">
            <div className="connect-content">
              <div className="connect-icon">◈</div>
              <h1 className="connect-title">Welcome to SolMobile</h1>
              <p className="connect-description">
                Connect your Solana mobile wallet to get started
              </p>
              <button className="connect-btn" onClick={connectWallet} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <div className="spinner"></div>
                    Connecting...
                  </>
                ) : (
                  'Connect Wallet'
                )}
              </button>
              <div className="connect-info">
                <p className="info-text">This app uses Solana Mobile Wallet Adapter</p>
                <p className="info-subtext">Your wallet app will open for authorization</p>
              </div>
              <div className="connect-features">
                <div className="feature">
                  <div className="feature-icon">⚡</div>
                  <div className="feature-text">Fast & Secure</div>
                </div>
                <div className="feature">
                  <div className="feature-icon">📱</div>
                  <div className="feature-text">Mobile First</div>
                </div>
                <div className="feature">
                  <div className="feature-icon">🔒</div>
                  <div className="feature-text">Non-Custodial</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard">
            <div className="wallet-card">
              <div className="wallet-header">
                <span className="wallet-label">Wallet Address</span>
                <button className="copy-btn" onClick={() => {
                  navigator.clipboard.writeText(walletAddress);
                  alert('Address copied!');
                }}>
                  Copy
                </button>
              </div>
              <div className="wallet-address">{formatAddress(walletAddress)}</div>
              <div className="balance-section">
                <div className="balance-label">Total Balance</div>
                <div className="balance-amount">
                  {balance.toFixed(4)} <span className="currency">SOL</span>
                </div>
                <div className="balance-usd">≈ ${(balance * 0).toFixed(2)} USD</div>
              </div>
              <div className="action-buttons">
                <button className="action-btn primary">
                  <span className="btn-icon">↓</span>
                  Receive
                </button>
                <button className="action-btn secondary">
                  <span className="btn-icon">↑</span>
                  Send
                </button>
              </div>
            </div>

            <div className="sign-message-card">
              {/* Inner Tab Navigation */}
              <div className="sign-tab-nav">
                <button
                  className={`sign-tab ${signTab === 'auth' ? 'active' : ''}`}
                  onClick={() => setSignTab('auth')}
                >
                  Server Auth
                </button>
                <button
                  className={`sign-tab ${signTab === 'sign' ? 'active' : ''}`}
                  onClick={() => setSignTab('sign')}
                >
                  Sign
                </button>
                <button
                  className={`sign-tab ${signTab === 'verify' ? 'active' : ''}`}
                  onClick={() => setSignTab('verify')}
                >
                  Verify
                </button>
              </div>

              {/* Server Authentication Tab */}
              {signTab === 'auth' && (
                <div className="sign-tab-content">
                  <p className="auth-description">
                    Authenticate with the server by signing a nonce message with your wallet.
                  </p>

                  {/* Auth Step Indicator */}
                  <div className="auth-steps">
                    <div className={`auth-step-indicator ${authStep === 'fetching_nonce' ? 'active' : ''} ${['signing', 'verifying', 'authenticated'].includes(authStep) ? 'done' : ''}`}>
                      <div className="step-number">1</div>
                      <div className="step-label">Get Nonce</div>
                    </div>
                    <div className="step-connector" />
                    <div className={`auth-step-indicator ${authStep === 'signing' ? 'active' : ''} ${['verifying', 'authenticated'].includes(authStep) ? 'done' : ''}`}>
                      <div className="step-number">2</div>
                      <div className="step-label">Sign</div>
                    </div>
                    <div className="step-connector" />
                    <div className={`auth-step-indicator ${authStep === 'verifying' ? 'active' : ''} ${authStep === 'authenticated' ? 'done' : ''}`}>
                      <div className="step-number">3</div>
                      <div className="step-label">Verify</div>
                    </div>
                  </div>

                  {/* Nonce Message Display */}
                  {nonceData && (
                    <div className="nonce-display">
                      <div className="nonce-label">Server Message</div>
                      <div className="nonce-message">{nonceData.message}</div>
                      <div className="nonce-meta">
                        <span>Nonce: {nonceData.nonce.slice(0, 12)}...</span>
                        <span>Expires: {new Date(nonceData.expires_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  )}

                  {/* Authenticate Button */}
                  {authStep !== 'authenticated' && (
                    <button
                      className="sign-btn"
                      onClick={authenticateWithServer}
                      disabled={['fetching_nonce', 'signing', 'verifying'].includes(authStep)}
                    >
                      {authStep === 'fetching_nonce' ? (
                        <><div className="spinner"></div>Fetching Nonce...</>
                      ) : authStep === 'signing' ? (
                        <><div className="spinner"></div>Sign in Wallet...</>
                      ) : authStep === 'verifying' ? (
                        <><div className="spinner"></div>Verifying...</>
                      ) : authStep === 'error' ? (
                        'Retry Authentication'
                      ) : (
                        'Authenticate with Server'
                      )}
                    </button>
                  )}

                  {/* Error Display */}
                  {authError && (
                    <div className="auth-error">
                      <span className="error-icon">!</span>
                      <span>{authError}</span>
                    </div>
                  )}

                  {/* Signature Display */}
                  {signatureDisplay && (
                    <div className="signed-result">
                      <div className="signed-label">Wallet Signature</div>
                      <div className="signed-value">{signatureDisplay}</div>
                      <button className="copy-btn" onClick={() => {
                        navigator.clipboard.writeText(signatureDisplay);
                        alert('Signature copied!');
                      }}>
                        Copy Signature
                      </button>
                    </div>
                  )}

                  {/* Token Display - shown after successful authentication */}
                  {authStep === 'authenticated' && (
                    <div className="tokens-container">
                      <div className="auth-success-badge">
                        <span className="success-icon">&#10003;</span>
                        Authenticated Successfully
                      </div>

                      <div className="token-display">
                        <div className="token-display-header">
                          <div className="token-display-label">Access Token</div>
                          <button className="copy-btn" onClick={() => {
                            navigator.clipboard.writeText(accessToken);
                            alert('Access token copied!');
                          }}>
                            Copy
                          </button>
                        </div>
                        <div className="token-display-value">{accessToken}</div>
                      </div>

                      <div className="token-display">
                        <div className="token-display-header">
                          <div className="token-display-label">Refresh Token</div>
                          <button className="copy-btn" onClick={() => {
                            navigator.clipboard.writeText(refreshToken);
                            alert('Refresh token copied!');
                          }}>
                            Copy
                          </button>
                        </div>
                        <div className="token-display-value">{refreshToken}</div>
                      </div>

                      {apiKey && (
                        <div className="token-display">
                          <div className="token-display-header">
                            <div className="token-display-label">API Key</div>
                            <button className="copy-btn" onClick={() => {
                              navigator.clipboard.writeText(apiKey);
                              alert('API key copied!');
                            }}>
                              Copy
                            </button>
                          </div>
                          <div className="token-display-value">{apiKey}</div>
                        </div>
                      )}

                      {userInfo && (
                        <div className="user-info-card">
                          <div className="user-info-label">User Info</div>
                          <div className="user-info-grid">
                            {userInfo.username && (
                              <div className="user-info-item">
                                <span className="info-key">Username</span>
                                <span className="info-val">{userInfo.username}</span>
                              </div>
                            )}
                            {userInfo.email && (
                              <div className="user-info-item">
                                <span className="info-key">Email</span>
                                <span className="info-val">{userInfo.email}</span>
                              </div>
                            )}
                            {userInfo.current_tier && (
                              <div className="user-info-item">
                                <span className="info-key">Tier</span>
                                <span className="info-val tier-badge">{userInfo.current_tier}</span>
                              </div>
                            )}
                            {userInfo.referral_code && (
                              <div className="user-info-item">
                                <span className="info-key">Referral</span>
                                <span className="info-val">{userInfo.referral_code}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        className="sign-btn reset-btn"
                        onClick={() => {
                          setAuthStep('idle');
                          setAuthError(null);
                          setNonceData(null);
                          setSignatureDisplay(null);
                          setAccessToken(null);
                          setRefreshToken(null);
                          setApiKey(null);
                          setUserInfo(null);
                        }}
                      >
                        Re-authenticate
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Sign Message Tab */}
              {signTab === 'sign' && (
                <div className="sign-tab-content">
                  <p className="auth-description">
                    Enter any message and sign it with your connected wallet.
                  </p>
                  <textarea
                    className="sign-input"
                    placeholder="Enter a message to sign..."
                    value={messageToSign}
                    onChange={(e) => setMessageToSign(e.target.value)}
                    rows={3}
                  />
                  <button
                    className="sign-btn"
                    onClick={signMessage}
                    disabled={isSigning || !messageToSign.trim()}
                  >
                    {isSigning ? (
                      <>
                        <div className="spinner"></div>
                        Signing...
                      </>
                    ) : (
                      'Sign Message'
                    )}
                  </button>
                  {signedMessage && (
                    <div className="signed-result">
                      <div className="signed-label">Signed Message</div>
                      <div className="signed-value">{signedMessage}</div>
                      <button className="copy-btn" onClick={() => {
                        navigator.clipboard.writeText(signedMessage);
                        alert('Signature copied!');
                      }}>
                        Copy Signature
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Verify Signature Tab */}
              {signTab === 'verify' && (
                <div className="sign-tab-content">
                  <p className="auth-description">
                    Verify that a message was signed by your connected wallet.
                  </p>
                  <textarea
                    className="sign-input"
                    placeholder="Enter the original message..."
                    value={verifyMessage}
                    onChange={(e) => { setVerifyMessage(e.target.value); setVerifyResult(null); }}
                    rows={3}
                  />
                  <textarea
                    className="sign-input"
                    placeholder="Enter the signature (base58)..."
                    value={verifySignatureInput}
                    onChange={(e) => { setVerifySignatureInput(e.target.value); setVerifyResult(null); }}
                    rows={2}
                  />
                  <div className="verify-wallet-info">
                    <span className="verify-wallet-label">Verifying against:</span>
                    <span className="verify-wallet-addr">{walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}` : ''}</span>
                  </div>
                  <button
                    className="sign-btn"
                    onClick={verifyMessageSignature}
                    disabled={isVerifying || !verifyMessage.trim() || !verifySignatureInput.trim()}
                  >
                    {isVerifying ? (
                      <>
                        <div className="spinner"></div>
                        Verifying...
                      </>
                    ) : (
                      'Verify Signature'
                    )}
                  </button>
                  {verifyResult === 'valid' && (
                    <div className="verify-result valid">
                      <span className="verify-result-icon">&#10003;</span>
                      <div className="verify-result-text">
                        <div className="verify-result-title">Valid Signature</div>
                        <div className="verify-result-desc">This message was signed by the connected wallet.</div>
                      </div>
                    </div>
                  )}
                  {verifyResult === 'invalid' && (
                    <div className="verify-result invalid">
                      <span className="verify-result-icon">&#10007;</span>
                      <div className="verify-result-text">
                        <div className="verify-result-title">Invalid Signature</div>
                        <div className="verify-result-desc">This signature does not match the message or wallet.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="tab-nav">
              <button className={`tab ${activeTab === 'wallet' ? 'active' : ''}`} onClick={() => setActiveTab('wallet')}>
                Activity
              </button>
              <button className={`tab ${activeTab === 'nfts' ? 'active' : ''}`} onClick={() => setActiveTab('nfts')}>
                NFTs
              </button>
              <button className={`tab ${activeTab === 'tokens' ? 'active' : ''}`} onClick={() => setActiveTab('tokens')}>
                Tokens
              </button>
            </div>

            <div className="content-area">
              {activeTab === 'wallet' && (
                <div className="transactions">
                  <h2 className="section-title">Recent Activity</h2>
                  {recentTransactions.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📭</div>
                      <p>No transactions yet</p>
                    </div>
                  ) : (
                    <div className="transaction-list">
                      {recentTransactions.map((tx) => (
                        <div key={tx.signature} className="transaction-item">
                          <div className="tx-icon">{tx.err ? '❌' : '✓'}</div>
                          <div className="tx-details">
                            <div className="tx-signature">{formatAddress(tx.signature)}</div>
                            <div className="tx-time">{formatTime(tx.timestamp)}</div>
                          </div>
                          <div className="tx-status">{tx.err ? 'Failed' : 'Success'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'nfts' && (
                <div className="nfts">
                  <h2 className="section-title">NFT Collection</h2>
                  <div className="empty-state">
                    <div className="empty-icon">🎨</div>
                    <p>No NFTs found</p>
                  </div>
                </div>
              )}
              {activeTab === 'tokens' && (
                <div className="tokens">
                  <h2 className="section-title">Token Holdings</h2>
                  <div className="token-list">
                    <div className="token-item">
                      <div className="token-icon">◈</div>
                      <div className="token-info">
                        <div className="token-name">Solana</div>
                        <div className="token-symbol">SOL</div>
                      </div>
                      <div className="token-balance">
                        <div className="token-amount">{balance.toFixed(4)}</div>
                        <div className="token-value">≈ ${(balance * 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }
        
        :root {
          --primary: #14F195;
          --primary-dark: #0FD17F;
          --secondary: #9945FF;
          --background: #0A0A0F;
          --surface: #15151F;
          --surface-light: #1F1F2E;
          --text: #FFFFFF;
          --text-secondary: #A1A1B5;
          --border: #2A2A3C;
          --success: #14F195;
          --error: #FF4757;
          --shadow: rgba(20, 241, 149, 0.1);
        }
        
        body {
          font-family: 'Syne', sans-serif;
          background: var(--background);
          color: var(--text);
          overflow-x: hidden;
          min-height: 100vh;
          background-image: 
            radial-gradient(circle at 20% 30%, rgba(153, 69, 255, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(20, 241, 149, 0.06) 0%, transparent 50%);
          background-attachment: fixed;
        }
        
        .app-container {
          max-width: 480px;
          margin: 0 auto;
          min-height: 100vh;
          position: relative;
          background: linear-gradient(180deg, rgba(21, 21, 31, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%);
          backdrop-filter: blur(20px);
        }
        
        .header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(21, 21, 31, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }
        
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 1.5rem;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .logo-icon {
          font-size: 1.75rem;
          color: var(--primary);
          animation: pulse 3s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        
        .logo-text {
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .menu-btn {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
        }
        
        .menu-icon {
          width: 24px;
          height: 2px;
          background: var(--text);
          position: relative;
        }
        
        .menu-icon::before,
        .menu-icon::after {
          content: '';
          position: absolute;
          width: 24px;
          height: 2px;
          background: var(--text);
        }
        
        .menu-icon::before {
          top: -7px;
        }
        
        .menu-icon::after {
          bottom: -7px;
        }
        
        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 1.5rem;
          background: var(--surface-light);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          animation: slideDown 0.2s ease;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .menu-item {
          width: 100%;
          padding: 1rem 1.5rem;
          background: none;
          border: none;
          color: var(--text);
          font-family: 'Syne', sans-serif;
          font-size: 0.95rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .menu-item:hover {
          background: var(--surface);
        }
        
        .menu-item.disconnect {
          color: var(--error);
        }
        
        .main-content {
          padding: 2rem 1.5rem;
          padding-bottom: 4rem;
        }
        
        .connect-screen {
          min-height: calc(100vh - 100px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .connect-content {
          text-align: center;
          animation: fadeInUp 0.6s ease;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .connect-icon {
          font-size: 5rem;
          color: var(--primary);
          margin-bottom: 2rem;
          animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        
        .connect-title {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, var(--text) 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        
        .connect-description {
          color: var(--text-secondary);
          font-size: 1.05rem;
          margin-bottom: 2rem;
          line-height: 1.6;
        }
        
        .connect-info {
          margin-bottom: 2rem;
        }
        
        .info-text {
          color: var(--primary);
          font-size: 0.9rem;
          font-family: 'Space Mono', monospace;
          margin-bottom: 0.5rem;
        }
        
        .info-subtext {
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-family: 'Space Mono', monospace;
        }
        
        .connect-btn {
          background: var(--primary);
          color: var(--background);
          border: none;
          padding: 1.25rem 3rem;
          border-radius: 16px;
          font-family: 'Space Mono', monospace;
          font-size: 1.05rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 0 30px var(--shadow);
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
        }
        
        .connect-btn:hover {
          background: var(--primary-dark);
          transform: translateY(-2px);
          box-shadow: 0 5px 40px var(--shadow);
        }
        
        .connect-btn:active {
          transform: translateY(0);
        }
        
        .connect-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .spinner {
          width: 18px;
          height: 18px;
          border: 3px solid var(--background);
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .connect-features {
          display: flex;
          gap: 2rem;
          justify-content: center;
          margin-top: 3rem;
        }
        
        .feature {
          text-align: center;
        }
        
        .feature-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        
        .feature-text {
          color: var(--text-secondary);
          font-size: 0.85rem;
          font-family: 'Space Mono', monospace;
        }
        
        .dashboard {
          animation: fadeInUp 0.6s ease;
        }
        
        .wallet-card {
          background: linear-gradient(135deg, var(--surface) 0%, var(--surface-light) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }
        
        .wallet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        
        .wallet-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .copy-btn {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--primary);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-family: 'Space Mono', monospace;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .copy-btn:hover {
          background: var(--primary);
          color: var(--background);
          border-color: var(--primary);
        }
        
        .wallet-address {
          font-family: 'Space Mono', monospace;
          font-size: 1.2rem;
          color: var(--text);
          margin-bottom: 2rem;
        }
        
        .balance-section {
          text-align: center;
          padding: 2rem 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          margin-bottom: 2rem;
        }
        
        .balance-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 1rem;
        }
        
        .balance-amount {
          font-size: 3rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 0.5rem;
          line-height: 1;
        }
        
        .currency {
          font-size: 1.5rem;
          color: var(--primary);
          font-family: 'Space Mono', monospace;
        }
        
        .balance-usd {
          font-size: 1.1rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
        }
        
        .action-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        
        .action-btn {
          padding: 1.25rem;
          border-radius: 16px;
          border: none;
          font-family: 'Syne', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        
        .action-btn.primary {
          background: var(--primary);
          color: var(--background);
          box-shadow: 0 0 20px var(--shadow);
        }
        
        .action-btn.primary:hover {
          background: var(--primary-dark);
          transform: translateY(-2px);
          box-shadow: 0 5px 30px var(--shadow);
        }
        
        .action-btn.secondary {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
        }
        
        .action-btn.secondary:hover {
          background: var(--surface-light);
          border-color: var(--primary);
          transform: translateY(-2px);
        }
        
        .btn-icon {
          font-size: 1.25rem;
          font-weight: 700;
        }
        
        .tab-nav {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 2rem;
          background: var(--surface);
          padding: 0.5rem;
          border-radius: 16px;
          border: 1px solid var(--border);
        }
        
        .tab {
          flex: 1;
          padding: 0.875rem;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-family: 'Syne', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 12px;
          transition: all 0.3s ease;
        }
        
        .tab.active {
          background: var(--primary);
          color: var(--background);
          box-shadow: 0 0 20px var(--shadow);
        }
        
        .tab:not(.active):hover {
          background: var(--surface-light);
          color: var(--text);
        }
        
        .content-area {
          animation: fadeIn 0.4s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .section-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          color: var(--text);
        }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
        }
        
        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }
        
        .empty-state p {
          color: var(--text-secondary);
          font-size: 1.05rem;
        }
        
        .transaction-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .transaction-item {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          transition: all 0.3s ease;
        }
        
        .transaction-item:hover {
          background: var(--surface-light);
          border-color: var(--primary);
          transform: translateX(4px);
        }
        
        .tx-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: var(--surface-light);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }
        
        .tx-details {
          flex: 1;
          min-width: 0;
        }
        
        .tx-signature {
          font-family: 'Space Mono', monospace;
          font-size: 0.95rem;
          color: var(--text);
          margin-bottom: 0.25rem;
        }
        
        .tx-time {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
        }
        
        .tx-status {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--success);
          font-family: 'Space Mono', monospace;
        }
        
        .token-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .token-item {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .token-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          flex-shrink: 0;
        }
        
        .token-info {
          flex: 1;
        }
        
        .token-name {
          font-size: 1.05rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        
        .token-symbol {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
        }
        
        .token-balance {
          text-align: right;
        }
        
        .token-amount {
          font-size: 1.1rem;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
          margin-bottom: 0.25rem;
        }
        
        .token-value {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
        }
        
        .sign-message-card {
          background: linear-gradient(135deg, var(--surface) 0%, var(--surface-light) 100%);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }

        .sign-tab-nav {
          display: flex;
          gap: 0.25rem;
          background: var(--background);
          padding: 0.25rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          margin-bottom: 1.5rem;
        }

        .sign-tab {
          flex: 1;
          padding: 0.75rem;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          border-radius: 10px;
          transition: all 0.3s ease;
        }

        .sign-tab.active {
          background: var(--secondary);
          color: var(--text);
          box-shadow: 0 0 15px rgba(153, 69, 255, 0.3);
        }

        .sign-tab:not(.active):hover {
          background: var(--surface-light);
          color: var(--text);
        }

        .sign-tab-content {
          animation: fadeIn 0.3s ease;
        }

        .sign-input {
          width: 100%;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          color: var(--text);
          font-family: 'Space Mono', monospace;
          font-size: 0.9rem;
          resize: vertical;
          margin-bottom: 1rem;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .sign-input::placeholder {
          color: var(--text-secondary);
        }

        .sign-input:focus {
          border-color: var(--primary);
        }

        .verify-wallet-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
        }

        .verify-wallet-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .verify-wallet-addr {
          font-size: 0.8rem;
          color: var(--primary);
          font-family: 'Space Mono', monospace;
          font-weight: 700;
        }

        .verify-result {
          display: flex;
          align-items: center;
          gap: 1rem;
          border-radius: 12px;
          padding: 1.25rem;
          margin-top: 1rem;
          animation: fadeIn 0.3s ease;
        }

        .verify-result.valid {
          background: rgba(20, 241, 149, 0.1);
          border: 1px solid rgba(20, 241, 149, 0.3);
        }

        .verify-result.invalid {
          background: rgba(255, 71, 87, 0.1);
          border: 1px solid rgba(255, 71, 87, 0.3);
        }

        .verify-result-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .verify-result.valid .verify-result-icon {
          background: rgba(20, 241, 149, 0.2);
          color: var(--primary);
        }

        .verify-result.invalid .verify-result-icon {
          background: rgba(255, 71, 87, 0.2);
          color: var(--error);
        }

        .verify-result-text {
          flex: 1;
        }

        .verify-result-title {
          font-family: 'Space Mono', monospace;
          font-size: 0.9rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .verify-result.valid .verify-result-title {
          color: var(--primary);
        }

        .verify-result.invalid .verify-result-title {
          color: var(--error);
        }

        .verify-result-desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          line-height: 1.4;
        }

        .auth-description {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .auth-steps {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-bottom: 1.5rem;
          padding: 1rem 0;
        }

        .auth-step-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.4;
          transition: all 0.3s ease;
        }

        .auth-step-indicator.active {
          opacity: 1;
        }

        .auth-step-indicator.active .step-number {
          background: var(--secondary);
          border-color: var(--secondary);
          animation: pulseStep 1.5s ease-in-out infinite;
        }

        .auth-step-indicator.done {
          opacity: 1;
        }

        .auth-step-indicator.done .step-number {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--background);
        }

        @keyframes pulseStep {
          0%, 100% { box-shadow: 0 0 0 0 rgba(153, 69, 255, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(153, 69, 255, 0); }
        }

        .step-number {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Space Mono', monospace;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
          transition: all 0.3s ease;
        }

        .step-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .step-connector {
          width: 40px;
          height: 2px;
          background: var(--border);
          margin: 0 0.5rem;
          margin-bottom: 1.5rem;
        }

        .nonce-display {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          margin-bottom: 1rem;
        }

        .nonce-label {
          font-size: 0.8rem;
          color: var(--secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.5rem;
        }

        .nonce-message {
          font-family: 'Space Mono', monospace;
          font-size: 0.8rem;
          color: var(--text);
          line-height: 1.6;
          word-break: break-word;
          margin-bottom: 0.75rem;
        }

        .nonce-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
        }

        .auth-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(255, 71, 87, 0.1);
          border: 1px solid rgba(255, 71, 87, 0.3);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          margin-top: 1rem;
          color: var(--error);
          font-size: 0.85rem;
          font-family: 'Space Mono', monospace;
        }

        .error-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--error);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          flex-shrink: 0;
        }

        .tokens-container {
          margin-top: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .auth-success-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(20, 241, 149, 0.1);
          border: 1px solid rgba(20, 241, 149, 0.3);
          border-radius: 12px;
          padding: 1rem;
          color: var(--primary);
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 0.95rem;
          animation: fadeIn 0.4s ease;
        }

        .success-icon {
          font-size: 1.2rem;
        }

        .token-display {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          transition: border-color 0.2s ease;
        }

        .token-display:hover {
          border-color: var(--secondary);
        }

        .token-display-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .token-display-label {
          font-size: 0.8rem;
          color: var(--secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .token-display-value {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          color: var(--text);
          word-break: break-all;
          line-height: 1.6;
          max-height: 80px;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .token-display-value::-webkit-scrollbar {
          width: 4px;
        }

        .token-display-value::-webkit-scrollbar-track {
          background: var(--surface);
          border-radius: 2px;
        }

        .token-display-value::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 2px;
        }

        .user-info-card {
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
        }

        .user-info-label {
          font-size: 0.8rem;
          color: var(--primary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.75rem;
        }

        .user-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .user-info-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .info-key {
          font-size: 0.7rem;
          color: var(--text-secondary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-val {
          font-size: 0.85rem;
          color: var(--text);
          font-family: 'Space Mono', monospace;
        }

        .tier-badge {
          display: inline-block;
          background: rgba(153, 69, 255, 0.2);
          color: var(--secondary);
          padding: 0.15rem 0.5rem;
          border-radius: 6px;
          font-size: 0.75rem;
          text-transform: capitalize;
          width: fit-content;
        }

        .reset-btn {
          background: var(--surface-light);
          border: 1px solid var(--border);
          margin-top: 0.5rem;
        }

        .reset-btn:hover:not(:disabled) {
          background: var(--surface);
          border-color: var(--secondary);
          box-shadow: none;
        }

        .sign-btn {
          width: 100%;
          background: var(--secondary);
          color: var(--text);
          border: none;
          padding: 1.25rem;
          border-radius: 16px;
          font-family: 'Space Mono', monospace;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }

        .sign-btn:hover:not(:disabled) {
          background: #7B2FE0;
          transform: translateY(-2px);
          box-shadow: 0 5px 30px rgba(153, 69, 255, 0.3);
        }

        .sign-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .signed-result {
          margin-top: 1rem;
          background: var(--background);
          border: 1px solid var(--primary);
          border-radius: 12px;
          padding: 1.25rem;
        }

        .signed-label {
          font-size: 0.8rem;
          color: var(--primary);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.75rem;
        }

        .signed-value {
          font-family: 'Space Mono', monospace;
          font-size: 0.75rem;
          color: var(--text);
          word-break: break-all;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        @media (max-width: 480px) {
          .main-content {
            padding: 1.5rem 1rem;
          }
          
          .wallet-card {
            padding: 1.5rem;
          }
          
          .balance-amount {
            font-size: 2.5rem;
          }
          
          .connect-title {
            font-size: 1.75rem;
          }
          
          .connect-features {
            gap: 1.5rem;
          }
        }
        
        @media (hover: none) {
          button:active {
            transform: scale(0.98);
          }
        }
      `}</style>
    </div>
  );
};

export default App;
