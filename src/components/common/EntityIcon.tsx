import React from 'react';
import {
  Anchor,
  BookOpen,
  Castle,
  Compass,
  Crown,
  Flame,
  Folder,
  Globe,
  HelpCircle,
  History,
  Image as ImageIcon,
  Languages,
  Map as MapIcon,
  MapPin,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  User,
  Users,
} from 'lucide-react';

export function EntityIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case 'Map':
      return <MapIcon className={className} />;
    case 'Asset':
      return <ImageIcon className={className} />;
    case 'Campaign':
      return <Compass className={className} />;
    case 'Character':
      return <User className={className} />;
    case 'Location':
      return <MapPin className={className} />;
    case 'Faction':
      return <Shield className={className} />;
    case 'Organization':
      return <Users className={className} />;
    case 'Item':
      return <Swords className={className} />;
    case 'Bestiary':
      return <Skull className={className} />;
    case 'Deity':
      return <Crown className={className} />;
    case 'Event':
      return <Flame className={className} />;
    case 'Chronicle':
      return <BookOpen className={className} />;
    case 'Session':
      return <ScrollText className={className} />;
    case 'PlotThread':
      return <Sparkles className={className} />;
    case 'Quest':
      return <HelpCircle className={className} />;
    case 'PlayerNote':
      return <ScrollText className={className} />;
    case 'Region':
      return <Globe className={className} />;
    case 'Culture':
      return <Users className={className} />;
    case 'History':
      return <History className={className} />;
    case 'Magic':
      return <Sparkles className={className} />;
    case 'Language':
      return <Languages className={className} />;
    case 'port':
      return <Anchor className={className} />;
    case 'citadel':
    case 'fortress':
      return <Castle className={className} />;
    case 'capital':
      return <Crown className={className} />;
    case 'temple':
      return <LandmarkIcon className={className} />;
    case 'camp':
      return <Flame className={className} />;
    case 'danger':
      return <Skull className={className} />;
    case 'landmark':
      return <Compass className={className} />;
    case 'settlement':
      return <MapPin className={className} />;
    case 'ruin':
      return <LandmarkIcon className={className} />;
    default:
      return <Folder className={className} />;
  }
}

export function LandmarkIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 22h18" />
      <path d="M6 18v-7" />
      <path d="M10 18v-7" />
      <path d="M14 18v-7" />
      <path d="M18 18v-7" />
      <polygon points="12 2 20 7 4 7" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function AethelgardCrest({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" className={className}>
      <circle cx="18" cy="18" r="15.5" stroke="#d4a853" strokeWidth="1.2" strokeOpacity="0.65" />
      <circle cx="18" cy="18" r="12.5" stroke="#d4a853" strokeWidth="0.7" strokeOpacity="0.35" strokeDasharray="2 2" />
      {/* World-Tree & Compass Spire */}
      <path
        d="M18 5.5 L20.5 14 L28 18 L20.5 20.5 L18 30.5 L15.5 20.5 L8 18 L15.5 14 Z"
        fill="url(#crestGold)"
        stroke="#f3d68a"
        strokeWidth="0.7"
      />
      <circle cx="18" cy="18" r="2.2" fill="#0b0d10" stroke="#f7ecc9" strokeWidth="0.9" />
      <defs>
        <linearGradient id="crestGold" x1="8" y1="5.5" x2="28" y2="30.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f3d68a" />
          <stop offset="55%" stopColor="#d4a853" />
          <stop offset="100%" stopColor="#8a6522" />
        </linearGradient>
      </defs>
    </svg>
  );
}
