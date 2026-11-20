import { MyComposition } from "./Composition";
import { ExplainerComposition } from "./Explainer";
import { LogoCompositions } from "./LogoAnimation";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <LogoCompositions />
      <ExplainerComposition />
    </>
  );
};
