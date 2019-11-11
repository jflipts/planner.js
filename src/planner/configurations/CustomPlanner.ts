import customProfile from "../../configs/custom";
import Planner from "./Planner";

export default class CustomPlanner extends Planner {
    constructor() {
        super(customProfile);
    }
}
