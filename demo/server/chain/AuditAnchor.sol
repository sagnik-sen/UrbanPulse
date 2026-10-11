// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Shared, append-only ledger of audit-log fingerprints for flood-response agencies.
// Each batch is the Merkle root of a block of audit entries; the entries themselves stay
// off-chain (no personal data on a public ledger). Only whitelisted agencies can anchor,
// and nothing can be edited or removed once written.
contract AuditAnchor {
    struct Batch {
        bytes32 root;
        uint32 count;
        uint64 anchoredAt;
        address agency;
    }

    address public immutable admin;
    mapping(address => string) public agencyName;
    Batch[] public batches;

    event AgencySet(address indexed agency, string name);
    event Anchored(uint256 indexed batchId, bytes32 root, uint32 count, address indexed agency);

    constructor(string memory name) {
        admin = msg.sender;
        agencyName[msg.sender] = name;
        emit AgencySet(msg.sender, name);
    }

    // empty name revokes the agency; its past batches stay on the ledger
    function setAgency(address agency, string calldata name) external {
        require(msg.sender == admin, "only admin");
        agencyName[agency] = name;
        emit AgencySet(agency, name);
    }

    function anchor(bytes32 root, uint32 count) external returns (uint256 batchId) {
        require(bytes(agencyName[msg.sender]).length > 0, "not an agency");
        require(count > 0, "empty batch");
        batchId = batches.length;
        batches.push(Batch(root, count, uint64(block.timestamp), msg.sender));
        emit Anchored(batchId, root, count, msg.sender);
    }

    function batchCount() external view returns (uint256) {
        return batches.length;
    }
}
