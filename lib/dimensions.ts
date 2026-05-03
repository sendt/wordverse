import { Dimensions } from "react-native";

export let W = Dimensions.get("window").width;
export let H = Dimensions.get("window").height;

Dimensions.addEventListener("change", ({ window }) => {
  W = window.width;
  H = window.height;
});
