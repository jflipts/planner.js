import delijnNmbsProfile from "../../configs/bus_train";
import Planner from "./Planner";

export default class DelijnNmbsPlanner extends Planner {
    constructor(profile = delijnNmbsProfile) {
        super(profile());
    }
}
