import { Table } from "aws-cdk-lib/aws-dynamodb";

export function applyAutoScaling(table: Table) {
    // On-demand billing does not support auto scaling. No-op.
}
