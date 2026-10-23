import { Composition } from "remotion";
import { ThreeClients } from "./ThreeClients";

export const MyComposition = () => {
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
