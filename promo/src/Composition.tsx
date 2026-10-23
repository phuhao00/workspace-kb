import { Composition } from "remotion";
import { ThreeClients } from "./ThreeClients";

/** ~7s @ 30fps — matches README explainer GIF. */
export const RemotionCompositions = () => {
  return (
    <Composition
      id="ThreeClients"
      component={ThreeClients}
      durationInFrames={210}
      fps={30}
      width={960}
      height={540}
    />
  );
};
