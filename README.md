# SolMobile - Solana Mobile Wallet App

A mobile-first Solana wallet management application built with React and **Solana Mobile Wallet Adapter**. This app provides a beautiful, modern interface for managing your Solana wallet directly from your mobile device using the official Mobile Wallet Adapter protocol.

## Features

- 🔐 **Solana Mobile Wallet Adapter** - Official mobile wallet connection protocol
- 📱 **Mobile-First Design** - Optimized for mobile devices with touch-friendly UI
- 💰 **Balance Tracking** - Real-time SOL balance updates
- 📊 **Transaction History** - View your recent Solana transactions
- 🎨 **Modern UI** - Beautiful gradient design with smooth animations
- 🔄 **Auto-Refresh** - Balance and transactions update every 30 seconds
- 🎯 **Three Tabs** - Activity, NFTs, and Tokens management

## What is Mobile Wallet Adapter?

The **Solana Mobile Wallet Adapter** is the official protocol for connecting mobile dApps to Solana wallets on mobile devices. Instead of browser extensions, it:
- Opens your mobile wallet app for authorization
- Provides secure transaction signing
- Works with any wallet that implements the Mobile Wallet Adapter spec
- Designed specifically for mobile experiences

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Android device** - Mobile Wallet Adapter works on Android (iOS support coming)
- **A compatible Solana wallet** installed on your Android device:
  - Phantom Mobile
  - Solflare Mobile
  - Ultimate Mobile
  - Any wallet implementing Mobile Wallet Adapter spec

## Installation

1. **Clone or download this project**

2. **Install dependencies:**
```bash
npm install
```

3. **Start the development server:**
```bash
npm run dev
```

The app will open at `http://localhost:3000`

## Usage

### Testing with Mobile Wallet Adapter

The Mobile Wallet Adapter protocol works by establishing a connection between your web app and a mobile wallet app installed on your device.

**Step 1: Setup on your computer**
```bash
npm install
npm run dev
```
This will start the server with `--host` flag, making it accessible on your network.

**Step 2: Find your computer's IP address**
- On Mac/Linux: `ifconfig | grep inet` or `hostname -I`
- On Windows: `ipconfig`
- Look for something like `192.168.x.x`

**Step 3: Access from your Android device**
1. Make sure your Android device is on the same WiFi network
2. Open your mobile browser (Chrome, Firefox, etc.)
3. Navigate to `http://YOUR_IP_ADDRESS:5173`
   - Example: `http://192.168.1.100:5173`

**Step 4: Connect Your Wallet**
1. Click "Connect Wallet" button in the app
2. Your installed wallet app (Phantom, Solflare, etc.) will automatically open
3. Review the connection request in your wallet
4. Approve the connection
5. You'll be redirected back to the browser with your wallet connected!

### How Mobile Wallet Adapter Works

When you click "Connect Wallet":
1. The app calls the Mobile Wallet Adapter protocol
2. Android opens your wallet app via deep linking
3. Your wallet shows an authorization request
4. You approve/reject in the wallet app
5. The wallet returns authorization to the browser
6. Your wallet is now connected!

This is different from browser extensions - it's a mobile-native flow.

### Features Overview

#### Wallet Dashboard
- **Balance Display**: Shows your total SOL balance
- **Wallet Address**: Displays your truncated address with copy function
- **Quick Actions**: Receive and Send buttons for transactions

#### Activity Tab
- View recent transaction history
- See transaction status (Success/Failed)
- Timestamps for each transaction

#### NFTs Tab
- Display your NFT collection (coming soon)

#### Tokens Tab
- View all token holdings
- Display SOL balance

## Project Structure

```
solana-mobile-wallet-app/
├── src/
│   ├── main.jsx                    # App entry point
│   └── solana-mobile-wallet.jsx    # Main wallet component
├── index.html                       # HTML template
├── package.json                     # Dependencies
├── vite.config.js                   # Vite configuration
└── README.md                        # This file
```

## Technical Details

### Mobile Wallet Adapter Protocol

This app uses the official `@solana-mobile/mobile-wallet-adapter-protocol` packages:

**How it works:**
```javascript
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';

// Authorize wallet connection
await transact(async (wallet) => {
  const authResult = await wallet.authorize({
    cluster: 'devnet',
    identity: {
      name: 'Your App Name',
      uri: window.location.origin,
      icon: 'favicon.ico',
    },
  });
  // Store auth token and account info
});
```

**Key Features:**
- Uses Android deep linking to open wallet apps
- Secure authorization with auth tokens
- Transaction signing within the wallet app
- Automatic account change detection
- Works with any MWA-compliant wallet

### Network Configuration

The app currently connects to Solana **devnet** for testing. To change the network, modify the connection in `solana-mobile-wallet.jsx`:

```javascript
const connection = useMemo(() => 
  new Connection(clusterApiUrl('devnet'), 'confirmed'), 
[]); // Change 'devnet' to 'mainnet-beta' for production
```

### Styling

The app uses:
- **Custom CSS** with CSS variables for theming
- **Google Fonts**: Syne (headings) and Space Mono (monospace)
- **Gradient design** with a cyberpunk/modern aesthetic
- **Responsive design** optimized for mobile screens

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory. You can serve them using:

```bash
npm run preview
```

## Deployment

For mobile wallet adapter to work properly, your app needs to be served over HTTPS in production. You can deploy to:

- **Vercel** - `vercel deploy`
- **Netlify** - `netlify deploy`
- **GitHub Pages** - requires HTTPS setup

## Troubleshooting

### Wallet won't connect
- **Make sure you're on Android** - Mobile Wallet Adapter currently works on Android devices
- **Install a compatible wallet** - Phantom, Solflare, or Ultimate mobile wallet
- **Same WiFi network** - Your phone and computer must be on the same network
- **Check the URL** - Make sure you're using your computer's IP address, not localhost
- **Allow popups** - Your browser might block the wallet app from opening

### "User declined" error
- This means you rejected the connection in your wallet app
- Try again and approve the connection request

### Wallet app doesn't open
- Make sure you have a compatible wallet installed
- Try force-closing and reopening your browser
- Check that your wallet app is up to date

### Balance shows 0
- You might be on devnet with no test SOL
- Get devnet SOL from: https://solfaucet.com
- Wait a few seconds for the balance to update

### Transactions not showing
- Make sure you're connected to the correct network (devnet/mainnet)
- Check that your wallet has transaction history
- Try refreshing the page

## Security Notes

⚠️ **Important Security Considerations:**

- Never share your private keys or seed phrases
- This is a demo app - don't use it with large amounts of mainnet SOL
- Always verify transaction details in your wallet before approving
- The app doesn't store any private keys - everything is handled by your mobile wallet

## Dependencies

- **React 18** - UI framework
- **@solana/web3.js** - Solana blockchain interaction
- **@solana-mobile/mobile-wallet-adapter-protocol** - Core MWA protocol
- **@solana-mobile/mobile-wallet-adapter-protocol-web3js** - Web3.js integration for MWA
- **bs58** - Base58 encoding (used by Solana addresses)
- **Vite** - Build tool and dev server

## Future Enhancements

- [ ] NFT display functionality
- [ ] Token swap integration
- [ ] Transaction sending UI
- [ ] QR code generation for receiving
- [ ] Multiple wallet support
- [ ] Transaction history filtering
- [ ] Dark/light theme toggle
- [ ] Localization support

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use this code for your own projects.

## Resources

- [Solana Mobile Wallet Adapter Docs](https://docs.solanamobile.com/getting-started/overview)
- [Mobile Wallet Adapter Specification](https://solana-mobile.github.io/mobile-wallet-adapter/spec/spec.html)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [Phantom Mobile Wallet](https://phantom.app/)
- [Solflare Mobile Wallet](https://solflare.com/)

---

Built with ❤️ using React and Solana Mobile Wallet Adapter
