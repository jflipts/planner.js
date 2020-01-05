import Catalog from "../../Catalog";
import customProfile from "../../configs/custom";
import Planner from "./Planner";

export default class CustomPlanner extends Planner {
    constructor(catalog: Catalog) {
        super(customProfile(catalog));
    }
}
