import { Metadata } from 'next';
import SeasonsClient from './seasons-client';

export const metadata: Metadata = {
  title: 'Past Seasons — CrazyChessBattles',
  description: 'Browse completed league seasons, champions, and final standings.',
};

export default function SeasonsPage() {
  return <SeasonsClient />;
}
