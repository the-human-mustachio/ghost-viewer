export interface Resource {
  type: string;
  urn: string;
  id?: string;
  outputs?: any;
  parent?: string;
}

export interface TreeNode {
  resource: Resource;
  children: TreeNode[];
  isMatch: boolean;
  isVisible: boolean;
}

export interface TypeGroup {
  typeName: string;
  nodes: TreeNode[];
  isVisible: boolean;
}

export interface ScanResult {
  totalFound: number;
  managedCount: number;
  orphans: any[];
}

export interface StateMetadata {
  app: string;
  stage: string;
  region: string;
  account: string;
}
