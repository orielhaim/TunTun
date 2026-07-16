# ACL-Protected Services

Serves inherit the network's access policy. You can further restrict which peers can access a specific serve by configuring ACL rules that reference tags or specific machine endpoint IDs.

For example, you might expose a database admin panel with `tunnet serve 8080` but restrict access to machines tagged `dba`. Only peers matching the ACL can establish a stream to the serve.

ACL rules for serves are configured in the dashboard when creating or editing a serve.
