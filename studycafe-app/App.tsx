import 'react-native-edge-to-edge';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WebViewScreen from './src/WebViewScreen';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style='dark' />
      <WebViewScreen />
    </SafeAreaProvider>
  );
}
