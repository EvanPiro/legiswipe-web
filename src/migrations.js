export const upgrade = (model) => {
  if (model.modelVersion === "v1") {
    return model;
  } else if (model.apiKey) {
    return v0ToV1(model);
  } else {
    return null;
  }
};

const v0ToV1 = (model) => ({
  ...model,
  showSponsor: false,
  modelVersion: "v1",
});
