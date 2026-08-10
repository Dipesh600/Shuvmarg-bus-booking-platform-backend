"use strict";

function componentText(component) {
  return component?.longText || component?.long_name || component?.shortText || component?.short_name || null;
}

function findComponent(components, acceptedTypes) {
  const match = (components || []).find((component) =>
    acceptedTypes.some((type) => (component.types || []).includes(type))
  );
  return componentText(match);
}

function googleAdministrativeContext(components) {
  return {
    province: findComponent(components, ["administrative_area_level_1"]),
    district: findComponent(components, ["administrative_area_level_2"]),
    municipality: findComponent(components, [
      "administrative_area_level_3", "locality", "sublocality_level_1", "sublocality",
    ]),
  };
}

module.exports = { googleAdministrativeContext };
