# DegenLander Portal

A collection of retro-styled games with crypto/finance themes including:
- Degenlander
- Ants Simulator
- NerdSoccer
- SpaceshipWorld
- CryptoShitter
- RugpullRoulette
- DegenerateSlots

## Development Setup

1. Clone the repository
2. Create a `.env` file in the root directory with the following variables:
```
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_auth_domain
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
FIREBASE_APP_ID=your_app_id
```

3. Set up Firebase:
   - Add your domain to authorized domains in Firebase Authentication Settings
   - Apply the security rules from js/firebase-rules.json to your Firebase Realtime Database
   - Restrict API access in Firebase Console if needed

4. Update stock data (for Degenlander):
```
cd Games/degenlander
python update_stock_data.py
```

## Security Notes

- The Firebase configuration is stored in config.js and included in the relevant HTML files
- .env file should never be committed to the repository
- Security is primarily enforced through Firebase Rules rather than API key protection
- Always restrict database access using proper Firebase Security Rules

## Deployment

The site is deployed at [degenlander.com](https://degenlander.com) using GitHub Pages with a custom domain.

## License

All rights reserved.