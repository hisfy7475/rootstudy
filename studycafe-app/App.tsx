import * as SplashScreen from 'expo-splash-screen';
import WebViewScreen from './src/WebViewScreen';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  return <WebViewScreen />;
}
