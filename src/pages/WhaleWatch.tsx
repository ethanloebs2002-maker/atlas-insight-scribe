import WhaleWatchPanel from '@/components/whale/WhaleWatchPanel';

export default function WhaleWatch() {
  // Default to BTC — in production this would come from route params or selected asset
  return <WhaleWatchPanel assetId="BTC" timeframe="4h" />;
}
