import { registerRootComponent } from 'expo';

// Registers the background location task. Must run at module load, before
// any UI, so a headless launch (phone moved while the app is killed) finds it.
import './src/location';

import App from './App';

registerRootComponent(App);
