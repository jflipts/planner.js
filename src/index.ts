import "isomorphic-fetch";
import "reflect-metadata";

import IsochroneGenerator from "./analytics/isochrones/main";
import Catalog from "./Catalog";
import ProfileTree from "./configs/custom_tree";
import TravelMode from "./enums/TravelMode";
import EventBus_ from "./events/EventBus";
import EventType from "./events/EventType";
import BasicTrainPlanner from "./planner/configurations/BasicTrainPlanner";
import CustomPlanner from "./planner/configurations/CustomPlanner";
import DelijnNmbsPlanner from "./planner/configurations/DelijnNmbsPlanner";
import DissectPlanner from "./planner/configurations/DissectPlanner";
import TransitCarPlanner from "./planner/configurations/TransitCarPlanner";
import TriangleDemoPlanner from "./planner/configurations/TriangleDemoPlanner";
import Units from "./util/Units";

export { default as EventType } from "./events/EventType";
export { default as IsochroneGenerator } from "./analytics/isochrones/main";
export { default as Units } from "./util/Units";
export { default as BasicTrainPlanner } from "./planner/configurations/BasicTrainPlanner";
export { default as CustomPlanner } from "./planner/configurations/CustomPlanner";
export { default as DelijnNmbsPlanner } from "./planner/configurations/DelijnNmbsPlanner";
export { default as DissectPlanner } from "./planner/configurations/DissectPlanner";
export { default as TransitCarPlanner } from "./planner/configurations/TransitCarPlanner";
export { default as TriangleDemoPlanner } from "./planner/configurations/TriangleDemoPlanner";
export { default as TravelMode } from "./enums/TravelMode";
export { default as Catalog } from "./Catalog";
export { default as ProfileTree } from "./configs/custom_tree";

export const EventBus = EventBus_.getInstance();

export default {
    TravelMode,
    EventType,
    IsochroneGenerator,
    Units,
    EventBus,
    BasicTrainPlanner,
    CustomPlanner,
    DelijnNmbsPlanner,
    DissectPlanner,
    TransitCarPlanner,
    TriangleDemoPlanner,
    Catalog,
    ProfileTree,
};

// import runDemo from "./demo-tiling-2h";
// import runDemo from "./demo";
// runDemo(true);
