export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface BrandFonts {
  heading: string;
  body: string;
}

/** The subset of a brand the composition builder needs. */
export interface BrandKit {
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  logoAssetId?: string | null;
  handle?: string | null;
}
