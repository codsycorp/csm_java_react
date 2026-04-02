import type { TreeProps } from "antd";

import type { BasicDataNode } from "antd/lib/tree";
import { Checkbox, Input, Tree } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface TreeDataNodeWithId extends BasicDataNode {
	id: string
	title: string
	children: TreeDataNodeWithId[]
}

interface FormTreeItemProps {
	treeData: TreeDataNodeWithId[]
	value?: React.Key[]
	onChange?: (value: React.Key[]) => void
}

const { Search } = Input;

function getParentKey(key: React.Key, tree: TreeDataNodeWithId[]): React.Key {
	let parentKey: React.Key;
	for (let i = 0; i < tree.length; i++) {
		const node = tree[i];
		if (node.children) {
			if (node.children.some(item => item.id === key)) {
				parentKey = node.id;
			}
			else if (getParentKey(key, node.children)) {
				parentKey = getParentKey(key, node.children);
			}
		}
	}
	return parentKey!;
}

export function FormTreeItem({ treeData, value = [], onChange }: FormTreeItemProps) {
	 const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
	 const [searchValue, setSearchValue] = useState("");
	 const [autoExpandParent, setAutoExpandParent] = useState(true);
	 const { t } = useTranslation();

	 // Helper: get all leaf node ids
	 const getLeafNodeIds = (nodes: TreeDataNodeWithId[]): React.Key[] => {
		 let leafIds: React.Key[] = [];
		 nodes.forEach(node => {
			 if (!node.children || node.children.length === 0) {
				 leafIds.push(node.id);
			 } else {
				 leafIds = leafIds.concat(getLeafNodeIds(node.children));
			 }
		 });
		 return leafIds;
	 };

	 // Helper: get all parent node ids (nodes with children)
	 const getParentNodeIds = (nodes: TreeDataNodeWithId[]): React.Key[] => {
		 let parentIds: React.Key[] = [];
		 nodes.forEach(node => {
			 if (node.children && node.children.length > 0) {
				 parentIds.push(node.id);
				 parentIds = parentIds.concat(getParentNodeIds(node.children));
			 }
		 });
		 return parentIds;
	 };

	 // Derive checkedOptions from value and treeData
	 const leafIds = getLeafNodeIds(treeData);
	 const allChecked = value.length === leafIds.length && leafIds.length > 0;
	 const checkedOptions = [
		 ...(expandedKeys.length > 0 ? ["expandAll"] : []),
		 ...(allChecked ? ["checkAll"] : []),
	 ];

	// const onSelect: TreeProps["onSelect"] = (selectedKeys) => {
	// 	onChange?.(selectedKeys);
	// };

	const onCheck: TreeProps["onCheck"] = (checkedKeys) => {
		onChange?.(checkedKeys as React.Key[]);
	};

	const onExpand = (newExpandedKeys: React.Key[]) => {
		setExpandedKeys(newExpandedKeys);
		setAutoExpandParent(false);
	};


	       // Flatten tree for search
	       const flattenTreeData = useMemo(() => {
		       const dataList: { id: React.Key, title: string, parentId?: React.Key }[] = [];
		       const generateList = (data: TreeDataNodeWithId[], parentId?: React.Key) => {
			       for (let i = 0; i < data.length; i++) {
				       const node = data[i];
				       dataList.push({ id: node.id, title: node.title as string, parentId });
				       if (node.children) {
					       generateList(node.children, node.id);
				       }
			       }
		       };
		       generateList(treeData);
		       return dataList;
	       }, [treeData]);

		       // Đảm bảo mỗi node có key = id
		       const addKeyToTree = (nodes: TreeDataNodeWithId[]): any[] =>
			       nodes.map(node => ({
				       ...node,
				       key: node.id,
				       children: node.children ? addKeyToTree(node.children) : undefined,
			       }));

		       // Lọc tree theo searchValue
		       const filterTree = (nodes: TreeDataNodeWithId[]): any[] => {
			       return nodes
				       .map(node => {
					       const match = t(node.title).toLowerCase().includes(searchValue.toLowerCase());
					       if (node.children) {
						       const filteredChildren = filterTree(node.children);
						       if (match || filteredChildren.length > 0) {
							       return { ...node, key: node.id, children: filteredChildren };
						       }
					       } else if (match) {
						       return { ...node, key: node.id };
					       }
					       return match ? { ...node, key: node.id } : null;
				       })
				       .filter(Boolean);
		       };

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { value } = e.target;
		const newExpandedKeys = flattenTreeData
			.map((item) => {
				if (t(item.title).includes(value)) {
					return getParentKey(item.id, treeData);
				}
				return null;
			})
			.filter((item, i, self): item is React.Key => !!(item && self.indexOf(item) === i));
		setExpandedKeys(newExpandedKeys);
		setSearchValue(value);
		setAutoExpandParent(true);
	};

		const onCheckboxChange = (checkedValues: string[]) => {
			// Handle expand/collapse all
			if (checkedValues.includes("expandAll")) {
				setExpandedKeys(getParentNodeIds(treeData));
			} else {
				setExpandedKeys([]);
			}
			// Handle check/cancel all
			if (checkedValues.includes("checkAll")) {
				onChange?.(leafIds);
			} else {
				onChange?.([]);
			}
		};
	return (
		<>
			<Search
				className="mb-3"
				placeholder={t("common.keywordSearch")}
				allowClear
				value={searchValue}
				onChange={handleSearchChange}
			/>
						<Checkbox.Group
							options={[
								{ label: checkedOptions.includes("expandAll") ? t("common.collapseAll") : t("common.expandAll"), value: "expandAll" },
								{ label: checkedOptions.includes("checkAll") ? t("common.cancelAll") : t("common.checkAll"), value: "checkAll" },
							]}
							value={checkedOptions}
							rootClassName="flex justify-between items-center mb-3"
							onChange={onCheckboxChange}
						/>

				       <Tree
					       checkable
					       blockNode
					       defaultExpandAll
					       // checkStrictly
					       titleRender={node => t(node.title as string)}
					       onExpand={onExpand}
					       expandedKeys={expandedKeys}
					       autoExpandParent={autoExpandParent}
					       checkedKeys={value}
					       // onSelect={onSelect}
					       treeData={searchValue ? filterTree(addKeyToTree(treeData)) : addKeyToTree(treeData)}
					       onCheck={onCheck}
				       />
		</>
	);
}
