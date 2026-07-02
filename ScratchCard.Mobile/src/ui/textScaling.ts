import { Text, TextInput } from "react-native";

// Cap the OS font-scale so very large accessibility text sizes don't blow out the app's many
// fixed-height rows and dense operational screens. 1.4x still gives low-vision users a meaningful
// boost while keeping layouts intact — applied globally as the default for every Text/TextInput.
const MAX_FONT_SCALE = 1.4;

type WithDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };

const textDefaults = Text as unknown as WithDefaults;
textDefaults.defaultProps = textDefaults.defaultProps ?? {};
textDefaults.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;

const inputDefaults = TextInput as unknown as WithDefaults;
inputDefaults.defaultProps = inputDefaults.defaultProps ?? {};
inputDefaults.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;
