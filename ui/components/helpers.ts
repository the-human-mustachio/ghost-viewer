import { Resource, TreeNode, TypeGroup } from "./types";
import { PROMOTED_TYPES } from "./constants";

export function safeRender(value: any): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (!value) return "";
  if (typeof value === "object") {
    if (value.ciphertext || value["4dabf18193072939515e22adb298388d"])
      return "[Encrypted Secret]";
    return JSON.stringify(value);
  }
  return String(value);
}

export function getHandlerName(r: Resource): string | null {
  const handler = r.outputs?._metadata?.handler || r.outputs?.handler;
  if (typeof handler === "string") {
    const fileName = handler.split("/").pop() || "";
    return fileName.split(".")[0] || handler;
  }
  return null;
}

export function getResourceId(r: Resource): string {
  // Return the physical ID or the last segment of the URN
  let baseId = "N/A";
  if (r.id && typeof r.id === "string") {
    baseId = r.id;
  } else if (r.outputs) {
    if (
      r.outputs.arn &&
      typeof r.outputs.arn === "string" &&
      !r.outputs.arn.includes("ciphertext")
    ) {
      baseId = r.outputs.arn.split(":").pop() || r.outputs.arn;
    } else if (r.outputs.name) {
      baseId = safeRender(r.outputs.name);
    }
  }

  if (baseId === "N/A") {
    const parts = r.urn.split("::");
    baseId = parts[parts.length - 1] || "N/A";
  }

  // Special handling for API Gateway Routes
  if (
    r.type.includes("apigateway") &&
    r.type.toLowerCase().includes("route") &&
    r.outputs?.routeKey
  ) {
    return `${baseId} : ${r.outputs.routeKey}`;
  }

  return baseId;
}

export function getSimpleType(type: string): string {
  const parts = type.split(":");
  const last = parts[parts.length - 1];
  return last.includes("/") ? last.split("/").pop() || last : last;
}

export function getAwsConsoleLink(r: Resource): string | null {
  const arn = r.outputs?.arn || r.id || "";
  const type = r.type.toLowerCase();
  const region = r.outputs?.region || "us-west-2";

  if (typeof arn === "string" && arn.startsWith("arn:aws:")) {
    const parts = arn.split(":");
    const service = parts[2];
    switch (service) {
      case "lambda":
        return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${parts[6]}?tab=code`;
      case "s3":
        return `https://s3.console.aws.amazon.com/s3/buckets/${
          arn.split(":::")[1]
        }?region=${region}`;
      case "dynamodb":
        return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "sqs":
        return (
          r.outputs?.url ||
          `https://${region}.console.aws.amazon.com/sqs/v2/home?region=${region}#/queues`
        );
      case "sns":
        return `https://${region}.console.aws.amazon.com/sns/v3/home?region=${region}#/topics/${arn}`;
      case "rds":
        return `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${
          parts[parts.length - 1]
        };is-cluster=true`;
      case "states":
        return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/statemachines/view/${arn}`;
      case "logs":
        return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(
          parts[6]
        )}`;
      case "apigateway":
        if (arn.includes("/apis/")) {
          const apiId = arn.split("/apis/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${apiId}/dashboard`;
        }
        if (arn.includes("/restapis/")) {
          const apiId = arn.split("/restapis/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/apis/${apiId}/resources`;
        }
        if (arn.includes("/domainnames/")) {
          const domain = arn.split("/domainnames/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/domain-names/${domain}`;
        }
        if (arn.includes("/vpclinks/")) {
          const id = arn.split("/vpclinks/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/vpc-links/${id}`;
        }
        if (arn.includes("/usageplans/")) {
          const id = arn.split("/usageplans/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/usage-plans/${id}`;
        }
        if (arn.includes("/apikeys/")) {
          const id = arn.split("/apikeys/")[1].split("/")[0];
          return `https://${region}.console.aws.amazon.com/apigateway/home?region=${region}#/api-keys/${id}`;
        }
        return null;
      case "iam":
        return `https://console.aws.amazon.com/iam/home?#/roles/details/${
          parts[5]?.split("/").slice(1).join("/") || parts[5]
        }`;
      case "events":
        return `https://${region}.console.aws.amazon.com/events/home?region=${region}#/rules/${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "cognito-idp":
        return `https://${region}.console.aws.amazon.com/cognito/v2/idp/user-pools/${
          parts[5]?.split("/")[1] || parts[5]
        }/info?region=${region}`;
      case "secretsmanager":
        return `https://${region}.console.aws.amazon.com/secretsmanager/home?region=${region}#!/secret?name=${encodeURIComponent(
          parts[6]
        )}`;
      case "acm":
        return `https://${region}.console.aws.amazon.com/acm/home?region=${region}#/?uuid=${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "cloudfront":
        return `https://console.aws.amazon.com/cloudfront/v3/home?#/distributions/${
          parts[5]?.split("/")[1] || parts[5]
        }`;
      case "appsync":
        return `https://${region}.console.aws.amazon.com/appsync/home?region=${region}#/apis/${parts[5]}/schema`;
      case "kinesis":
        return `https://${region}.console.aws.amazon.com/kinesis/home?region=${region}#/streams/details/${
          parts[5]?.split("/")[1] || parts[5]
        }/monitoring`;
      case "ec2":
        if (arn.includes("/vpc-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#VpcDetails:VpcId=${id}`;
        }
        if (arn.includes("/subnet-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#SubnetDetails:SubnetId=${id}`;
        }
        if (arn.includes("/igw-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#InternetGateway:internetGatewayId=${id}`;
        }
        if (arn.includes("/sg-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#SecurityGroup:groupId=${id}`;
        }
        if (arn.includes("/rtb-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#RouteTableDetails:RouteTableId=${id}`;
        }
        if (arn.includes("/nat-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/vpc/home?region=${region}#NatGatewayDetails:NatGatewayId=${id}`;
        }
        if (arn.includes("/eni-")) {
          const id = arn.split("/")[1];
          return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}#Nic:networkInterfaceId=${id}`;
        }
        return `https://${region}.console.aws.amazon.com/ec2/v2/home?region=${region}`;
      default:
        return `https://${region}.console.aws.amazon.com/console/home?region=${region}`;
    }
  }
  if (typeof arn === "string" && arn !== "") {
    if (type.includes("s3/bucket"))
      return `https://s3.console.aws.amazon.com/s3/buckets/${arn}?region=${region}`;
    if (type.includes("lambda/function"))
      return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${arn}`;
    if (type.includes("dynamodb/table"))
      return `https://${region}.console.aws.amazon.com/dynamodbv2/home?region=${region}#table?name=${arn}`;
  }
  return null;
}

export function buildTree(
  allResources: Resource[],
  matchedUrns: Set<string>,
  mode: "tree" | "categorized" | "grouped"
): TypeGroup[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  allResources.forEach((r) => {
    nodeMap.set(r.urn, {
      resource: r,
      children: [],
      isMatch: matchedUrns.has(r.urn),
      isVisible: false,
    });
  });
  allResources.forEach((r) => {
    const node = nodeMap.get(r.urn)!;
    const sType = getSimpleType(r.type);
    const isPromoted = PROMOTED_TYPES.includes(sType);
    const shouldBeRoot =
      mode === "grouped"
        ? true
        : mode === "categorized"
        ? isPromoted || !r.parent || r.parent.includes("pulumi:pulumi:Stack")
        : !r.parent || r.parent.includes("pulumi:pulumi:Stack");
    if (!shouldBeRoot && r.parent && nodeMap.has(r.parent)) {
      const parentNode = nodeMap.get(r.parent)!;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const calculateVisibility = (node: TreeNode): boolean => {
    let childVisible = false;
    node.children.forEach((child) => {
      if (calculateVisibility(child)) childVisible = true;
    });
    node.isVisible = node.isMatch || childVisible;
    return node.isVisible;
  };
  roots.forEach(calculateVisibility);
  const groups: Record<string, TreeNode[]> = {};
  roots.forEach((node) => {
    if (!node.isVisible) return;
    const typeName = getSimpleType(node.resource.type);
    if (!groups[typeName]) groups[typeName] = [];
    groups[typeName].push(node);
  });
  return Object.entries(groups)
    .map(([typeName, nodes]) => ({
      typeName,
      nodes,
      isVisible: nodes.length > 0,
    }))
    .sort((a, b) => a.typeName.localeCompare(b.typeName));
}
