import { ArrayIterator, AsyncIterator } from "asynciterator";
import { injectable } from "inversify";
import IConnection from "../../../entities/connections/connections";
import { LinkedConnectionsPage } from "../../../entities/connections/page";
import IConnectionsIteratorOptions from "../IConnectionsIteratorOptions";
import IConnectionsProvider from "../IConnectionsProvider";

@injectable()
export default class ConnectionsProviderNMBSTest implements IConnectionsProvider {
  private connections: Array<IteratorResult<IConnection>> = [];
  private s = {};

  constructor(connections: Array<IteratorResult<IConnection>>) {
    this.connections = connections;
  }

  public getByUrl(url: string): Promise<LinkedConnectionsPage> {
    throw new Error("Method not implemented.");
  }
  public getByTime(date: Date): Promise<LinkedConnectionsPage> {
    throw new Error("Method not implemented.");
  }

  public prefetchConnections(): void {
    return;
  }

  public createIterator(options: IConnectionsIteratorOptions): AsyncIterator<IConnection> {
    let array = this.connections
      .map((r) => r.value);

    if (options.backward) {
      array = array.reverse();
    }

    return new ArrayIterator(array);
  }
}
